# PSG-96 CSV import: re-validate edited rows on the server

Ticket: "CSV import: client resolveRowStatus clears server errors after an edit".
Origin: Q3 of `docs/specs/2026-11-21-psg-91-csv-import-restyle-design.md` (latent bug, filed
as its own ticket). `docs/tech-debt.md` has no entry for it; none needed once this ships.

## Problem

`resolveRowStatus` in `web/src/lib/ui/ImportSalesDraft.svelte` returns `error:gift-recipient-missing`
or `ok`. `updateRow` and `updateAllocation` run it after every edit, so any edit to a row
that carried a server-raised state (`error:match-missing`, `error:opponent-not-found`,
`error:unallocated`, `error:invalid-cell`, `error:sold-after-kickoff`, and the `warn:*`
states) flips it to `ok`. Example: change the date on an `error:match-missing` row and it
shows Ready and "Import N sales" enables, even if the new date is still wrong.

No bad data is written: `CommitSalesImportUsecase` re-runs `validateCommitRows` and throws
`IMPORT_ROWS_INVALID`. The harm is a UI that says Ready, then fails on commit with a generic
message and no row marked.

The client cannot compute the other states itself: it has no match list, and the rules
(`resolveMatch`, allocation sum, `resolveSoldAtStatus`, `isInvalidRow`) live in
`src/api/sales-import/sales-import.resolver.ts`. The existing client copy of
`resolveGiftRecipientStatus` is "the only import rule the client can check without
match/pass data" (comment in the component).

## Options

A. Sticky server states until a re-preview. `resolveRowStatus` keeps any non-client
   status once set.
   - Benefit: web-only, about 40 lines, no new contract.
   - Cost: an errored row can never turn Ready by fixing it. The only way out is Back and
     re-upload, which discards every edit. That removes the reason the table is editable
     (fix the date, opponent or allocation on a bad row). Making it field-aware ("date edit
     clears match errors") re-implements server rules on the client, the duplication this
     ticket is trying to remove. Rejected.

B. Re-validate endpoint (recommended). New `POST /sales/import/validate` runs the existing
   `validateCommitRows` over the draft rows and returns the rows with fresh `rowStatus` and
   `matchId`. The web calls it (debounced) after each edit and replaces statuses with the
   answer.
   - Benefit: statuses are always the server's, including warnings and a corrected row
     turning Ready. Zero new rules: the endpoint is `validateCommitRows` plus the same
     `passesValidator` and home-match load the commit usecase already does. Preview, validate
     and commit then share one resolver.
   - Cost: two layers (about 130 backend + 170 web lines), one request per edit burst
     (payload is the draft, bounded by the 512 KB upload cap), async states in the UI
     (pending, failed), and a stale-response race to guard.

C. Mark edited rows "unverified" and force Back/re-preview. Same dead end as A with an
   extra status. Rejected.

Recommendation: B. A is the cheap fix but trades one UI lie for a worse regression.

## Design

### Backend

`POST /sales/import/validate`, same auth as commit.

- Request: `CommitRequestDto` (reused as is: `selectedPassIds`, `rows`).
- Response: `{ rows: DraftRowDto[]; summary: { total; errors; warnings } }`, i.e.
  `ValidateOutput`. Add `ValidateImportResponse` DTO class in `dto/validate-import-response.dto.ts`
  mirroring the shape (same pattern as `preview-response.dto.ts`).
- `SalesImportController.validate` delegates to `SalesImportService.validate(userId, dto)`.
- `SalesImportService.validate`: `passesValidator.validate(userId, dto.selectedPassIds)` to get
  the season year, `matchesDb.getHomeMatchesForSeason(year)`, then `validateCommitRows`. No
  ORM import in the service (it already holds `IMatchesDbService`). No new db file, no
  usecase: it is a short orchestration over two existing collaborators, which the
  usecase-layer rule says not to extract.
- Row order is preserved by `validateCommitRows` (it pushes in input order). That is the
  contract the web relies on and a test pins it.
- Invalid pass selection returns the same error as commit (`passesValidator` throws).
- Writes nothing, invalidates no cache.

### Web

`web/src/lib/api/sales-import.ts`: `validateImport(selectedPassIds, rows): Promise<ValidateResponse>`
with the same `extractMessage` error handling as `commitImport`. `ValidateResponse` type in
`web/src/lib/types/sales-import.ts`.

Pure helpers in `web/src/lib/import-draft.ts` (unit-testable, no Svelte):

- `applyValidation(rows, validated): DraftRow[]`: returns rows with `rowStatus` and `matchId`
  taken from `validated` by position, every user-editable field kept from `rows`. Returns
  `rows` unchanged if lengths differ.

Component changes in `ImportSalesDraft.svelte`:

- `resolveRowStatus(row, previous)`: returns `error:gift-recipient-missing` if
  `needsRecipient(row)`, otherwise `previous` (keep the row's current status). So the one
  rule the client can check still reacts instantly, and nothing else is cleared locally.
  The duplicate-of-server comment stays, shortened.
- After `updateRow`, `updateAllocation`, `deleteRow` is NOT triggered (delete changes no row's
  validity), `addRow` IS triggered (new row has never been validated). Each trigger calls
  `scheduleValidation()`.
- `scheduleValidation()`: increments `editVersion`, sets `validating = true`, restarts a
  300 ms timer. On fire, captures `version = editVersion`, calls `validateImport`. On
  response, applies `applyValidation` only if `version === editVersion` (latest wins; a
  stale response is dropped). `validating = false` only when the applied/latest request
  settles.
- `canImport` additionally requires `!validating` and `!validationFailed`.
- On request failure: `validationFailed = true`, `errorMessage` shows the server or
  "Could not re-check rows." message; the next edit clears the flag and retries. Import stays
  disabled, so the UI never claims Ready on unverified data.
- Visual: while `validating`, the summary line shows "Checking..." in muted text and the
  Import button is disabled (existing disabled style). No per-row spinner.
- Commit path unchanged. `IMPORT_ROWS_INVALID` remains the backstop.

### Not in scope

- Per-row (single-row) validate request. `validateCommitRows` is row-independent, so
  sending one row is possible, but deletes shift table indices and make row identity
  ambiguous; sending the whole draft avoids that. Revisit only if payloads hurt.
- Playwright coverage for the import flow (PSG-91 Q5), duplicate detection, any change to
  preview or commit contracts.
- Removing the client copy of the gift-recipient rule. It gives instant feedback and costs
  nothing to keep.

## Testing

Backend (Jest, nested `describe` per condition):
- `sales-import.service.spec.ts`: `validate` when all rows valid returns `ok` rows and zero
  errors; when a row date matches no home match returns `error:match-missing` for that row
  only; when a warn row returns `warn:*` and counts it; output order equals input order;
  when passes are invalid the `passesValidator` error propagates; nothing is written.
- Controller spec if one exists for the other routes, else covered via service.

Web (Vitest, `import-draft.spec.ts`):
- `applyValidation` when lengths match: statuses and `matchId` replaced, edited fields kept;
  when lengths differ: rows returned unchanged; when validated row is `ok`: previously
  errored row becomes `ok`.
- Component behaviour (debounce, version drop, failure) has no test harness in this repo;
  verify manually via the `run` skill and record in the PR.

## Open questions

- Q1: Import button while a re-check is in flight is disabled. Alternative is allowing it and
  relying on commit. Recommend disabled; slightly slower to click, never lies.
- Q2: 300 ms debounce, no throttle on the server. Other endpoints have none either. Fine
  unless abuse matters; the route is authenticated.
- Q3: On failure the user must edit again to retry (no retry button). Recommend accept;
  add a button only if it shows up in use.
- Q4: Should deletion also re-check? Recommend no (rows are independent); confirm.
