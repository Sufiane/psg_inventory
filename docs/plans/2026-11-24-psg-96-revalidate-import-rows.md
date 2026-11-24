# PSG-96 re-validate edited import rows implementation plan

Spec: `docs/specs/2026-11-24-psg-96-revalidate-import-rows-design.md`.

## Size and ticket split

Total about 300 hand-written lines (tests included), under the ~800 cap. Two layers, so
split into two tickets, each independently mergeable:

| Slice | Layer | Est. lines | Depends on |
|---|---|---|---|
| PSG-96a `feat(sales-import): add validate endpoint` | backend | ~130 | none |
| PSG-96b `fix(web): re-validate import rows after edit` | web | ~170 | 96a |

The contract is fixed in the spec, so 96b can be built against a stubbed
`validateImport` in parallel; merge order stays 96a then 96b. Follow-ups that stay out:
Playwright import e2e (PSG-91 Q5), retry button on failure.

**Conventions for builders:** conventional commits (`feat(sales-import): ...`,
`fix(web): ...`) ending with the Co-Authored-By line. Stage and stop for `/crit`; do not
commit before the user's go-ahead. Linear PSG-96 to In Progress first; In Review only once
staged. Pull main first. Branch name must be `psg-96` before any push (rename now if it is
`doha/psg-96-handle`; never after a PR exists). Explicit return types, no single-letter
names, braces on every `if`, blank line before `if/for/return/throw`, snake_case error
codes, no barrel files, no comments unless a non-obvious why, nested `describe` per
condition in specs, exact dependency pins (none expected).

---

## Slice 96a: backend

### Task 1. Response DTO

File: `src/api/sales-import/dto/validate-import-response.dto.ts` (new).

- [ ] Class `ValidateImportResponse` with `rows: DraftRowDto[]` and
  `summary: { total: number; errors: number; warnings: number }`, modelled on
  `preview-response.dto.ts`.

### Task 2. Service `validate` (TDD)

Files: `src/api/sales-import/sales-import.service.spec.ts`, `sales-import.service.ts`.

- [ ] Write failing specs first, one `describe` per condition: all rows valid; a row date
  with no home match (only that row `error:match-missing`, summary errors 1); a warn row
  (`warnings` counted); output order equals input order; `passesValidator` throws (error
  propagates, `getHomeMatchesForSeason` not called).
- [ ] Run `npx jest src/api/sales-import/sales-import.service.spec.ts`; confirm failures.
- [ ] Implement `async validate(userId: UserId, dto: CommitRequestDto): Promise<ValidateImportResponse>`:
  `seasonStartYear = await this.passesValidator.validate(userId, dto.selectedPassIds)`,
  `homeMatches = await this.matchesDb.getHomeMatchesForSeason(seasonStartYear)`, return
  `validateCommitRows({ rows: dto.rows, homeMatches, selectedPassIds: dto.selectedPassIds })`.
  No ORM import; no cache invalidation; no writes.
- [ ] Re-run the spec file; green.

### Task 3. Controller route

Files: `src/api/sales-import/sales-import.controller.ts` (+ controller spec if present).

- [ ] Add `@Post('validate') async validate(@User() user, @Body() body: CommitRequestDto): Promise<ValidateImportResponse>`
  delegating to the service. Place it before `@Delete(':batchId')`.
- [ ] Confirm global ValidationPipe applies to the DTO (same as commit). If an auth/e2e spec
  enumerates routes, add this one.
- [ ] `npm run lint` and `npm run typecheck` (or the repo equivalents) clean. Stage; stop for `/crit`.

---

## Slice 96b: web (after 96a, or against a stub)

### Task 4. Types and API client

Files: `web/src/lib/types/sales-import.ts`, `web/src/lib/api/sales-import.ts`.

- [ ] Add `ValidateResponse = { rows: DraftRow[]; summary: PreviewSummary }`.
- [ ] Add `validateImport(selectedPassIds, rows): Promise<ValidateResponse>`: POST
  `/api/sales-import/validate`, JSON body, same `!response.ok` -> `extractMessage` path as
  `commitImport`.

### Task 5. `applyValidation` helper (TDD)

Files: `web/src/lib/import-draft.spec.ts`, `web/src/lib/import-draft.ts`.

- [ ] Failing specs: when lengths match, `rowStatus` and `matchId` come from the validated
  rows and every other field (date, opponent, recipient, allocations) stays as in `rows`;
  when a previously errored row validates `ok`, it becomes `ok`; when lengths differ, input
  is returned unchanged.
- [ ] Run `cd web && npx vitest run src/lib/import-draft.spec.ts`; red.
- [ ] Implement `applyValidation(rows: DraftRow[], validated: DraftRow[]): DraftRow[]`.
- [ ] Green.

### Task 6. Wire the component

File: `web/src/lib/ui/ImportSalesDraft.svelte`.

- [ ] Change `resolveRowStatus(row, previous)`: `needsRecipient(row)` -> gift error, else
  `previous`. Update `updateRow` and `updateAllocation` to pass `row.rowStatus` of the
  pre-edit row. Shorten the duplicate-rule comment to the why only.
- [ ] Add state: `validating`, `validationFailed`, `editVersion` (plain counter), debounce
  timer handle. Clear the timer in an `$effect` cleanup so unmount cancels it.
- [ ] `scheduleValidation()` per the spec: bump version, `validating = true`, 300 ms timer,
  call `validateImport(selectedPassIds, rows)`, apply via `applyValidation` only when the
  captured version equals `editVersion`; stale responses are dropped without touching
  `validating`. On error set `validationFailed` and `errorMessage`; clear both at the start
  of the next schedule.
- [ ] Call `scheduleValidation()` at the end of `updateRow`, `updateAllocation`, `addRow`.
  Not from `deleteRow`.
- [ ] `canImport` also requires `!validating && !validationFailed`. Summary line shows
  "Checking..." (muted) while `validating`.
- [ ] Run `cd web && npm run typecheck && npm run lint && npm test`.
- [ ] Manual check with the `run` skill and a CSV containing a date with no home match:
  edit the date to another bad date (stays error, Import disabled), edit to a valid date
  (turns Ready after about 300 ms), edit fast twice (final state wins), kill the API and
  edit (failure message, Import disabled). Record results in the PR description.
- [ ] Stage; stop for `/crit`.

---

## Parallelism

Backend (Tasks 1-3) and web (Tasks 4-6) share only the contract in the spec. They can be
dispatched to `backend-builder` and `frontend-builder` in parallel; web verification of
Task 6 needs 96a merged or running locally.
