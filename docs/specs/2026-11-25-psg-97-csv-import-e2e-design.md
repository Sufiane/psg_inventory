# PSG-97: Playwright e2e coverage for the CSV import flow

## Problem

Nothing in `e2e/tests` drives the Import CSV modal. Unit specs cover the parser, resolver and commit usecase, and `import-draft.spec.ts` covers the web helpers, but nothing proves pick passes, upload, preview, the recipient block, commit and undo work through the real web proxy (`web/src/routes/api/sales-import/*`) and backend. PSG-91 restyled the modal and PSG-96 added debounced re-validation, so the UI has moved a lot with no browser safety net.

## Findings

- Entry point: `Import CSV` button in `SalesToolbar` on `/sales`; opens `ImportSalesModal` (`<dialog aria-labelledby="import-sales-title">`, title "Import sales").
- Source step: pass checkboxes (`ImportPassPicker`, label = pass label, `E2E Tribune`), hidden `<input type="file" accept=".csv">` inside a label, `Preview` button disabled until at least one pass and a file are set.
- Review step (`ImportSalesDraft`): editable table with `aria-label` inputs (`Recipient`, `Price`, ...). A GIFTED row without recipient gets placeholder `Recipient required` and `aria-invalid`; the footer button `Import N` is disabled while any row errors or validation is in flight (`Checking...`).
- After commit: `<p role="status">N sale(s) imported.</p>` with `Undo import` and `Done`. Undo calls `DELETE /api/sales-import/:batchId`, clears the result, shows `Import reverted. You can re-import.` and returns to the draft table. Undo is only reachable before `Done`.
- Seed (`scripts/seed-e2e.ts`) creates one home match `E2E Test FC` at UTC now+30 days 19:00, and one pass `E2E Tribune` in that match's season. Rows must reference that match by `YYYY-MM-DD` date. The date moves daily, so a static CSV file cannot work.
- Resolver rules that matter: unknown date gives `error:match-missing`; GIFTED without recipient gives `error:gift-recipient-missing`; `soldAt` after match day gives an error; one selected pass auto-allocates `nbTickets`.
- Conventions: browser specs are `*.e2e-spec.ts`, listed in the `authenticated` project's `testMatch` regex (a spec not listed never runs; see memory note). Auth comes from `storageState` (global-setup login). Seed constants live in `e2e/fixtures.ts`, duplicated in the seed script by hand. Specs run `fullyParallel` against one shared seeded match, so each test uses distinct listed prices (sale spec uses 501 and 502) and locates rows by opponent plus price. Role/label locators, `describe` blocks per condition.
- `docs/tech-debt.md`: no entry about import e2e. The only import entry is the complexity ratchet (PSG-49), not relevant. PSG-96 plan listed "Playwright import e2e (PSG-91 Q5)" as a follow-up; this ticket is it.

## Design

Layer: e2e only. No backend or web change.

### Files

- `e2e/playwright.config.ts`: add `import` to the `authenticated` `testMatch` regex.
- `e2e/fixtures.ts`: add `e2eMatchDate(): string` returning the seeded match's UTC date (`now + 30d`, `YYYY-MM-DD`), mirroring `seedMatch`, plus a `buildImportCsv(rows)` helper that returns a Playwright file payload `{ name, mimeType: 'text/csv', buffer }`. The header is the full column list so rows can omit optional cells. (Open question 1 covers placing the CSV builder in its own file.)
- `e2e/tests/sales-import.e2e-spec.ts`: new spec.

### CSV fixture

Generated in memory per test, not a file on disk, because the match date changes every day. Rows use unique listed prices (611 pending, 612 gifted with recipient, 613 gifted without recipient) so rows are unambiguous next to rows other specs create.

### Scenarios

Shared `beforeEach`: `goto('/sales')`, click `Import CSV`, expect the `Import sales` dialog. Helper `pickPassAndUpload(page, csv)` ticks `E2E Tribune` (expanding `Previous seasons` first if the seeded pass is not in the current season, which happens between 1 Jul and 31 Jul UTC), calls `setInputFiles` on the file input, clicks `Preview`, waits for the table.

1. `describe('when no pass is picked')`: `Preview` is disabled even with a file set. Cheap guard for the "pick passes" step.
2. `describe('when a gifted row has no recipient')`:
   - table shows the row, `Recipient` input has placeholder `Recipient required`, `Import N` is disabled.
   - filling `Recipient` re-enables `Import N` (waits out `Checking...`, which doubles as PSG-96 coverage).
   - Test ends with `Cancel`; nothing written.
3. `describe('when the CSV is valid')`:
   - preview shows both rows, `Import 2` is enabled, click it.
   - `2 sales imported.` status is visible.
   - A second page in the same browser context loads `/sales` and sees both rows (proves the commit persisted and the web page refreshed, without leaving the modal).
   - `Undo import` shows `Import reverted.`; reload of the second page shows neither row.
   - Cleanup is the undo itself, so the test leaves no sales behind. If an assertion fails before undo, the seed script wipes the user's sales at the next run, same as the other specs rely on.

Scenarios 2 and 3 are separate tests (3 writes data). Scenario 1 can fold into 2 to save a modal open; planner keeps it separate for clarity, cost is about 8 lines.

### Parallel-safety

Only scenario 3 writes. Its rows are unique by price and undone at the end. Accounting and dashboard specs assert structure and labels, not totals (checked), so a transient pair of sales does not break them. Sales page specs filter rows by their own price.

## Out of scope

- Row editing (date, price, allocation edits), missing-match "add row" button, past-season warning, drag and drop upload, non-CSV rejection, validate-endpoint errors. Each can be a follow-up ticket; this one covers the path named in the ticket.
- API-level import specs (`*.api.e2e-spec.ts`).
- Any change to the seed script (not needed).

## Open design questions

1. CSV builder in `fixtures.ts` or its own `e2e/import-csv.ts`? Recommended own file only if it passes about 30 lines; otherwise `fixtures.ts`.
2. Match date computed in the spec (mirrors seed) vs read from the API at test time. Computed is simple but drifts if the tests run on a different UTC day than the seed (a local rerun across midnight UTC) or the seed offset changes; CI seeds and tests in one job. Recommended: computed, with a comment pointing to the seed. Alternative: query matches through the backend with `loginAsE2eUser` (about +15 lines, no drift).
3. Verify persistence via a second page (chosen) vs `Done`, then check `/sales`, then delete rows through the UI. The second page lets the test exercise Undo, which is only reachable before `Done`.

## Size

XS to S, about 140 lines: config 1, fixtures about 25, spec about 115. Fits in one PR under the 800 cap; single layer (e2e), single actor.
