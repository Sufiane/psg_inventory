# PSG-97 CSV import Playwright e2e implementation plan

Spec: `docs/specs/2026-11-25-psg-97-csv-import-e2e-design.md`.

## Size and ticket split

About 140 hand-written lines, e2e only, one actor, one layer. Single ticket, single PR; no split. Not parallelisable (backend and web untouched).

**Conventions for the builder:** conventional commit `test(e2e): cover csv import flow` ending with the Co-Authored-By line. Stage and stop for `/crit`; no commit before the user's go-ahead. Linear PSG-97 to In Progress first; In Review only once staged. Pull main first. Branch name must be `psg-97` before any push (current branch `dodoma/psg-97-handle`; rename before pushing, never after a PR exists). Explicit return types, no single-letter names, braces on every `if`, blank line before `if/for/return/throw`, no comments unless a non-obvious why, nested `describe` per condition, no new dependencies.

---

## Task 1. Register the spec in Playwright config

File: `e2e/playwright.config.ts`.

- [ ] Add `sales-import` to the `authenticated` `testMatch` regex: `/(sale|sales-import|season-pass|accounting|matches|dashboard)\.e2e-spec\.ts/`. Note `sale` already matches only `sale.e2e-spec.ts` (anchored by `\.e2e-spec`), so `sales-import` needs its own alternative.
- [ ] Run `npx playwright test --list` in `e2e/` and confirm the new file is listed once under `authenticated` and not under `api` or `auth` (after Task 3 exists).

## Task 2. Fixture helpers

File: `e2e/fixtures.ts` (or `e2e/import-csv.ts` if over about 30 lines, see spec Q1).

- [ ] `e2eMatchDate(): string`: UTC date of now + 30 days as `YYYY-MM-DD`, same offset as `DAYS_FROM_NOW` in `scripts/seed-e2e.ts`. Add a one-line comment pointing at the seed (a hand-sync constraint the reader cannot see).
- [ ] `E2E_IMPORT_*` constants: prices 611, 612, 613 and recipient name `E2E Import Recipient`.
- [ ] `buildImportCsv(rows: ImportCsvRow[]): { name: string; mimeType: string; buffer: Buffer }`: header `date,opponent,listedPrice,nbTickets,status,invest,soldAt,recipient`, joins rows, `name: 'sales-import.csv'`, `mimeType: 'text/csv'`.
- [ ] Run `npm run typecheck` and `npm run lint` in `e2e/`.

## Task 3. Spec: write the failing scenarios first

File: `e2e/tests/sales-import.e2e-spec.ts` (new). Needs the full stack up (`npm run local:db:seed:e2e`, backend on 7777, web preview on 4173, per `.github/workflows/ci.yml`).

- [ ] Helpers: `openImportModal(page)`, `pickPassAndUpload(page, csv)` (tick `E2E Tribune`; if the checkbox is hidden, click `Previous seasons` summary first; `setInputFiles` on `input[type=file]`; click `Preview`), `importedRow(page, price)` (`getByRole('row', { name: new RegExp(`${E2E_OPPONENT_NAME}.*${price}`) })` on `/sales`).
- [ ] Test "when no pass is picked": upload file only, expect `Preview` disabled.
- [ ] Test "when a gifted row has no recipient": upload rows 611 PENDING and 613 GIFTED without recipient. Expect the `Recipient` textbox with placeholder `Recipient required`, button `Import 2` disabled. Fill the recipient, expect `Import 2` enabled (web-first assertion; auto-waits through `Checking...`). Click `Cancel`, expect the dialog hidden.
- [ ] Test "when the CSV is valid": rows 611 PENDING and 612 GIFTED with recipient. Click `Import 2`. Expect `2 sales imported.` visible. Open a second page via `page.context().newPage()`, `goto('/sales')`, expect `importedRow` 611 visible and a row matching `Gifted to E2E Import Recipient` visible. Back on the first page click `Undo import`, expect `Import reverted.`, reload the second page, expect both rows count 0. Close the second page.
- [ ] Run `npx playwright test sales-import --project=authenticated` three times, confirm green and no leftover sales (re-run the seed is not needed; the undo cleans up).
- [ ] Run the full `npm test` in `e2e/` to confirm no interference with `sale`, `accounting`, `dashboard` specs under `fullyParallel`.

## Task 4. Gates and stage

- [ ] `npm run typecheck` and `npm run lint` in `e2e/` pass with zero warnings.
- [ ] Stage `e2e/` changes plus these docs; stop for `/crit`. Commit message: `test(e2e): cover csv import flow`.

## Risks to watch while building

- Locator ambiguity: `Import N` label includes the row count; use exact names. The gifted row on `/sales` renders "Gifted to <recipient>" rather than a price (see `sale.e2e-spec.ts`), so locate it by recipient, not price.
- If the dialog's inputs are still `Checking...`, assertions on `Import N` rely on auto-wait (default 5s); the debounce is 300 ms.
- Seed pass year: between 1 Jul and 31 Jul UTC the pass sits under `Previous seasons` and the past-season warning shows; the helper handles the collapsed group, no assertion on the warning.
