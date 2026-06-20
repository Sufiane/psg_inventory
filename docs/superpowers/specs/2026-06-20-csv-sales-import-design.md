# CSV sales import — design

Date: 2026-06-20
Status: approved (brainstorm)
Owner: Sufiane

## Goal

Let a user bulk-import past or current-season sales from a CSV they already maintain in a spreadsheet, so users moving from spreadsheets to this app can backfill their history without re-entering every match by hand. Import must be easy (minimal CSV shape, no pre-existing knowledge of internal IDs), accurate (every row validated and reviewed before persistence), and reversible (a bad import can be undone in one click).

## Non-goals

- Importing matches or opponents. Matches must already exist in the DB; the importer never creates them.
- Importing season passes. The user creates/selects passes inside the import modal before uploading the CSV.
- Importing for multiple seasons in one file. One CSV = one season.
- Server-side draft persistence. The draft only lives in the browser between preview and commit; closing the modal discards it.
- Overwriting or merging existing sales. Each CSV row creates a new sale, even if the match already has sales for that user.

## User flow

1. User clicks **Import sales** (entry point on the season page, and on the global Sales view).
2. **Modal step 1 — Select passes.** User picks one or more existing `SeasonPasses` for the target season, or creates new ones inline using the existing pass-creation form. Modal records `selectedPassIds` and the inferred `seasonStartYear` (all selected passes must share the same year; otherwise step 1 blocks with an error).
3. **Modal step 2 — Upload CSV.** User drops a file. Client posts `multipart/form-data` to `POST /sales/import/preview` with `{ file, selectedPassIds }`.
4. **Server preview.** Server parses the CSV, resolves matches, computes default allocations, and returns annotated draft rows plus a summary (counts, warnings, errors, coverage gap).
5. **Modal step 3 — Review draft.** Table of rows with inline editors and status pills. User edits until errors = 0. A coverage panel lists home matches in the season that have no sale row in the draft; user can click to add one.
6. **Validate.** Client posts the final row set + `selectedPassIds` to `POST /sales/import/commit`. Server re-validates everything, runs a single Prisma transaction, stamps each created `Sales` row with `importBatchId`, returns the batch summary.
7. **Post-commit.** Toast: `23 sales imported · [Undo import]`. Undo calls `DELETE /sales/import/:batchId`; available indefinitely.

## CSV format

- Header row required.
- Columns (exact names, case-sensitive):
  - `date` — ISO `YYYY-MM-DD`.
  - `opponent` — string; case-insensitive match against `Opponents.name`.
  - `listedPrice` — non-negative integer, euros (no cents, no decimals). Stored as-is.
  - `nbTickets` — integer ≥ 1.
  - `status` — `PENDING | SOLD | CANCELLED`, case-insensitive.
  - `invest` — non-negative integer euros; default 0 if column omitted.
- Unknown columns → hard error (prevents silent data loss when a user mislabels a column).
- Missing required column → hard error.
- Blank rows skipped silently.
- BOM / CRLF / quoted commas handled (standard CSV parsing).

No `profit` column: profit is computed from `listedPrice − invest − pass share` by existing accounting logic.

No `competition` column: taken from the resolved match.

## Match resolution (per row)

Scope: home matches only, within the season window (`seasonStartYear` June → `seasonStartYear + 1` June).

1. Look up matches by `date`:
   - 1 match → resolved. If `opponent` cell matches case-insensitively, status `ok`. If not, status `warn:opponent-mismatch` (still resolved, just flagged).
   - 0 matches → status `error:match-missing`. User fixes the date in the draft.
   - >1 matches on the same date → disambiguate by opponent. None match → status `error:opponent-not-found`.
2. No duplicate-sale detection: multiple sales per `(userId, matchId)` are valid.

## Allocation rules

Inputs: `selectedPassIds` (from modal step 1) and `nbTickets` (from the row).

- `nbTickets === 1` → `[{ passId: selectedPassIds[0], nbTickets: 1 }]`, status `ok`. User can reassign to a different selected pass in the draft.
- `nbTickets > 1` and exactly 1 pass selected → `[{ passId: selectedPassIds[0], nbTickets }]`, status `warn:multi-ticket-single-pass`.
- `nbTickets > 1` and >1 passes selected → `allocations: []`, status `error:unallocated`. User must split tickets across passes in the draft popover before validating.

## Coverage check

Computed once during preview.

- Count of home matches in the season window: `H`.
- Count of resolved sale rows: `R`.
- If `R < H`, return `missingMatches: [{ matchId, date, opponentName }]` for matches with zero rows in the draft. Surfaced as a panel under the draft table with "+ add sale" buttons.

This is a nudge, not an error: a user can validate with missing matches (some matches have no sale, legitimately).

## Draft UI (SvelteKit, modal step 3)

- Header bar: `23 rows · 2 errors · 3 warnings · 1 missing match` + **Validate** button (disabled while errors > 0).
- Table columns: status pill | date | opponent | listedPrice | nbTickets | invest | status | allocation summary | row actions (edit / delete).
- Inline editors:
  - Click cell → input.
  - Date or opponent edit triggers a debounced re-preview of the full draft set (simpler than per-row resolve; the preview endpoint is idempotent and cheap).
  - Allocation cell opens a popover with one number input per selected pass; total must equal the row's `nbTickets`.
- Missing-matches panel: list of unsold home matches with "+ add sale" buttons. Clicking inserts a draft row pre-filled with that match's date + opponent; status defaults to `PENDING`. Date picker on user-added rows is constrained to home matches of the season that don't already have a row in the draft.

## Backend module shape

New module: `src/api/sales/import/`, following the project's hex split.

| File | Responsibility |
|---|---|
| `sales-import.module.ts` | Wires controller + service + db. Imports `MatchesModule`, `SeasonPassesModule`, `PrismaModule`. |
| `sales-import.controller.ts` | Routes: `POST /sales/import/preview`, `POST /sales/import/commit`, `DELETE /sales/import/:batchId`. JWT-guarded, user-scoped. |
| `sales-import.service.ts` | CSV parsing, DTO validation, match resolution (delegates to `MatchesDb`), allocation defaults, preview assembly, commit orchestration. **No Prisma import.** |
| `sales-import.db.ts` | Only file in the module that imports Prisma. Bulk-creates `Sales` + `SalePassAllocations` in a single `prisma.$transaction`. Bulk-deletes by `importBatchId` for revert. Returns raw results; no domain throws. |
| `dto/` | `PreviewRequestDto`, `CommitRequestDto`, `DraftRowDto`, `PreviewResponseDto`. |

CSV parser dependency: pick one, pin exact (per project policy). Default candidate: `papaparse` (mature, handles BOM/quoting/streaming).

## Endpoints

### `POST /sales/import/preview`

Request: `multipart/form-data` — `file` (CSV) + `selectedPassIds` (json string array).

Response (200):
```ts
{
  rows: DraftRow[],
  summary: { total: number, errors: number, warnings: number },
  missingMatches: { matchId: string, date: string, opponentName: string }[],
  seasonStartYear: number,
}
```

`DraftRow` includes the parsed values, resolved `matchId` (or null), default `allocations`, and a `status` field with one of: `ok | warn:opponent-mismatch | warn:multi-ticket-single-pass | error:match-missing | error:opponent-not-found | error:unallocated | error:invalid-cell`.

Errors that fail the whole upload (4xx, no row list): missing required columns, unknown columns, empty file, `selectedPassIds` from different seasons.

### `POST /sales/import/commit`

Request:
```ts
{
  selectedPassIds: string[],
  rows: DraftRow[],   // client-edited
}
```

Server re-runs full validation (does not trust client `status` annotations). If any row has an error → `400` with the re-annotated row list. Otherwise → single `prisma.$transaction`:
- Generate `batchId = uuid()`.
- Bulk-create `Sales` with `importBatchId = batchId`.
- Bulk-create `SalePassAllocations`.

Response (201): `{ batchId: string, salesCreated: number }`.

### `DELETE /sales/import/:batchId`

Authorization: only the user who owns the batch (`userId` match). Runs `prisma.sales.deleteMany({ where: { importBatchId, userId } })`. Cascade removes allocations via existing `onDelete: Cascade` on `SalePassAllocations`.

Response (200): `{ deleted: number }`. Returns 404 if the user does not own a batch with that id.

## Schema change

Single Prisma migration:

```prisma
model Sales {
  // ... existing fields ...
  importBatchId String? @map("import_batch_id")

  @@index([userId, importBatchId])
}
```

Nullable: existing sales (created via the UI) have `null`. No new tables.

## Error handling summary

| Condition | Where caught | UX |
|---|---|---|
| Missing required column / unknown column | preview, 400 | Modal stays on step 2 with a clear message naming the column. |
| Invalid cell (e.g. `nbTickets = 0`, decimal `listedPrice`) | preview, row-level | Row marked `error:invalid-cell`; user edits the cell. |
| Match not found by date | preview, row-level | Row marked `error:match-missing`; user edits date or deletes the row. |
| Opponent mismatch on a uniquely-dated match | preview, row-level | Row marked `warn:opponent-mismatch`; resolved but flagged. |
| Multi-ticket sale with multiple passes selected | preview, row-level | Row marked `error:unallocated`; allocation popover required before validate. |
| Commit hits an error after edits | commit, 400 | Re-render draft with server's re-annotated rows. |
| Revert by non-owner | revert, 404 | Generic not-found. |

## Testing

- **Unit** (`sales-import.service.spec.ts`, Jest): CSV parse edge cases (BOM, quoted commas, CRLF, unknown headers, blank rows), DTO validation, allocation rules across all three branches, match resolution across all four branches (0/1/many/opponent mismatch).
- **Integration** (`sales-import.controller.spec.ts`, real Prisma against test DB): full preview → commit → revert cycle, importBatchId stamping, cascade delete of allocations, user-scoping (user A cannot revert user B's batch).
- **Web**: component test for the modal's three steps (no e2e infra assumed).

## Out-of-scope / future

- Importing matches from CSV (separate feature; not required for sales import to be useful, since users converting from spreadsheets typically know which seasons they need fixtures for and the existing football-data sync can backfill).
- Server-side draft persistence (saving an in-progress review across browser sessions).
- Overwrite / merge mode for sales already in the DB.
- Cross-season imports in a single file.
