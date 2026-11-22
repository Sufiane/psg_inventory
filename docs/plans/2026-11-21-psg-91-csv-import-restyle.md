# PSG-91 CSV import restyle — implementation plan

Spec: `docs/specs/2026-11-21-psg-91-csv-import-restyle-design.md`. Frontend only (`web/`).

## Proposed ticket split (estimate exceeds comfortable single-PR size)

Total about 700 to 800 changed lines (adds + deletes, tests included). Under the ~800 hard cap
but with no headroom: both Svelte files are near-full markup rewrites. Split into three
mergeable slices, all web layer, one actor (staff), no backend:

| Slice | Content | Est. lines | Depends on |
|---|---|---|---|
| S1 | `import-draft.ts` + spec, `Button` secondary variant | ~220 | none |
| S2 | Modal shell, merged step 1, `ImportPassPicker`, drop zone | ~330 | S1 (Button variant) |
| S3 | Draft table, summary, chips, footer | ~320 | S1; merge after S2 (touches the same modal `<ImportSalesDraft>` call and `onCancel` wiring) |

If the coordinator prefers one PR it fits under the cap at ~750 but review is heavy; recommend
the split. Follow-up tickets (not in this plan): client `resolveRowStatus` clears server
errors after edit (Q3); Playwright import spec + `testMatch` entry (Q5); backend duplicate
detection only if wanted.

Conventions for every task (from the user's global rules): explicit return types, no
single-letter names, braces on all `if`s, blank line before `if/for/return/throw`, no barrel
files, no comments unless a non-obvious why, numeric separators on 5+ digit literals, nested
`describe` per condition in tests, exact-pinned deps (no new deps here), conventional commits.
Stage and stop; user runs `/crit` before commit.

---

## S1: helpers and Button variant

### Task 1: import-draft helper (TDD)

Files: create `web/src/lib/import-draft.ts`, `web/src/lib/import-draft.spec.ts`.

1. Write failing spec `import-draft.spec.ts` (vitest, mirror `sale-helpers.spec.ts` style):
   - `describe('summarizeDraft')`:
     - `when rows is empty`: `{ total: 0, ready: 0, attention: 0, errors: 0 }`.
     - `when rows mix ok, warn and error`: ready counts rows with neither; attention counts
       warn + error; errors counts error only.
   - `describe('rowStateTone')`: `when status is ok` -> `'ok'`; `when starts with warn:` ->
     `'warn'`; `when starts with error:` -> `'error'`.
   - `describe('rowStateLabel')`: an exhaustiveness test over a local `ALL_ROW_STATUSES:
     DraftRowStatus[]` of all nine values, asserting each returns a non-empty string and the
     nine labels are distinct; plus explicit assertions for the labels in spec section 4.4.
   - `describe('needsRecipient')`: `when GIFTED with undefined/blank/whitespace recipient` ->
     true; `when GIFTED with a name` -> false; `when status is not GIFTED` -> false.
   Build `DraftRow` fixtures with a small `makeRow(patch)` using the branded casts already
   used in the component (`as ListedPrice` etc.).
2. Run `cd web && npx vitest run src/lib/import-draft.spec.ts`; expect failure (module
   missing).
3. Implement `import-draft.ts`:
   - `export type RowStateTone = 'ok' | 'warn' | 'error';`
   - `export function summarizeDraft(rows: DraftRow[]): { total: number; ready: number;
     attention: number; errors: number }`
   - `export function rowStateTone(status: DraftRowStatus): RowStateTone`
   - `const ROW_STATE_LABELS: Record<DraftRowStatus, string>` (exhaustive; compiler fails on
     a new backend status) and `export function rowStateLabel(status: DraftRowStatus): string`
   - `export function needsRecipient(row: DraftRow): boolean` (`status === 'GIFTED'` and
     `(row.recipient ?? '').trim().length === 0`)
   - `export function rowStateClass(tone: RowStateTone): string` returning the chip classes
     (`bg-warning/15 text-warning-strong`, `bg-negative/15 text-negative-strong`,
     `text-ink-muted` for ok). Add a short spec for it.
   Import types from `$lib/types/sales-import`.
4. Re-run the spec; expect pass.
5. Stage.

### Task 2: Button secondary variant

Files: modify `web/src/lib/ui/Button.svelte`; extend or add `web/src/lib/ui/` spec only if
the repo has a component harness (it does not; skip).

1. Add `variant?: 'primary' | 'secondary'` to `Props`, default `'primary'`.
2. Split `base` into shared layout classes plus a variant map: primary keeps the current
   `bg-brand text-on-brand hover:bg-brand-hover`; secondary uses `border border-line-strong
   bg-transparent text-ink hover:bg-surface-strong`. Keep `min-h-11`, `disabled:opacity-60`.
3. Confirm default output string for primary is byte-identical to today (so the 12 existing
   call sites do not change): diff the class list by eye.
4. `cd web && npx svelte-check` and `npm run lint` (or the workspace lint script); expect clean.
5. Stage S1 and stop for `/crit`.

---

## S2: modal shell and step 1

### Task 3: ImportPassPicker component

Files: create `web/src/lib/ui/ImportPassPicker.svelte`.

1. Props: `passes: SeasonPass[]`, `selectedPassIds: string[]`, `onToggle: (id: string) => void`.
2. Move grouping logic (`passesByYear`, `currentGroup`, `previousGroups`, `currentYear`) out
   of the modal into the picker; keep the modal's `selectedYears` / `hasPreviousSelected` /
   `passesStepValid` (they gate Preview and the warnings), or expose them via a tiny pure
   function in `import-draft.ts` (`selectedSeasonYears(passes, ids)`) with a spec if moved.
   Prefer the pure function plus spec to keep logic testable.
3. Markup: one `{#snippet passRow(pass)}` rendering a selectable row (label wraps checkbox,
   `{pass.label} - {pass.category}, row {pass.row}, seat {pass.seat}`; checked state
   `bg-surface-strong border-line-strong`; `min-h-11`). Current season fieldset with legend
   "Current season · {year}"; previous seasons in `<details>`. Empty state keeps the
   "No season passes yet. Create one first" link to `/season`.
4. Stage nothing yet (verified with Task 4).

### Task 4: modal shell and merged step 1

Files: modify `web/src/lib/ui/ImportSalesModal.svelte`.

1. Replace `step` type with `'source' | 'review'`; remove the `passes` -> `upload` hop.
   `submitUpload` unchanged. `reset()` sets `'source'`. Keep dialog effect, `handleClose`,
   `handleCommitted`.
2. Shell: title `font-display`, icon close button (inline SVG x, `aria-label="Close import
   dialog"`, `min-h-11 min-w-11`), `rounded-lg`, `max-w-2xl` for source and `max-w-5xl` for
   review via a derived class, scrollable body, footer outside the scroll area. Add the
   two-item step indicator (current item `text-ink`, other `text-ink-faint`,
   `aria-current="step"`).
3. Source step body: intro sentence (existing wording), `ImportPassPicker`, past-season and
   mixed-season notices (existing logic, restyled with the sales-page warning/negative
   patterns), then the drop zone.
4. Drop zone: `<label>` with `ondragover` (preventDefault, set `dragging`), `ondragleave`,
   `ondrop` (take `event.dataTransfer?.files[0]`, ignore non-`.csv`, set `file`); inner
   `<input type="file" accept=".csv,text/csv" class="sr-only">`; classes
   `border-2 border-dashed border-line-strong`, `border-primary bg-surface-strong` while
   dragging, `has-[:focus-visible]:outline`. Show file name + size (`$lib/format` has no byte
   formatter; use a local `formatFileSize(bytes): string` in `import-draft.ts` with a spec)
   or the prompt "Drop a CSV here or click to choose". Keep the column-format helper text
   under it, same wording, `code` for columns.
5. Footer (source step): secondary "Cancel" -> `handleClose`; primary "Preview" disabled
   when `!passesStepValid || file == null || loading`, `loading` bound. Error message above
   the footer.
6. Review step: render `ImportSalesDraft` as today; pass `onBack={() => (step = 'source')}`
   and `onCancel={handleClose}`. (S3 consumes these props; S2 must keep the draft compiling,
   so in S2 add both props to the draft with the minimal wiring: `onBack` on the existing
   Back link, `onCancel` unused until S3.) Alternative that avoids this: land S3's prop
   change in S2. Pick the minimal wiring.
7. `npx svelte-check`, lint, then manual check in the running app (`run` skill): open
   Import from the Sales page, select passes, drag and click upload, keyboard tab through the
   drop zone, 375 px width, past-season warning, mixed-season error.
8. Stage S2 and stop for `/crit`.

---

## S3: draft table

### Task 5: summary, chips, recipient highlight

Files: modify `web/src/lib/ui/ImportSalesDraft.svelte`.

1. Replace the local `summary` derived with `summarizeDraft(rows)`; `canImport = rows.length
   > 0 && summary.errors === 0 && !loading`. Rename `canValidate`/`validate` to
   `canImport`/`importRows` (no behaviour change).
2. Add props `onBack` and `onCancel` (cancel closes via the modal). Header row: "Back"
   button on the left, summary line on the right: `{summary.ready} rows ready,
   {summary.attention} need attention` (singular "row ready" when 1), `text-warning-strong`
   on the attention span when > 0. Zero rows: "No rows to import".
3. Row-state cell: replace the raw string with `rowStateLabel(row.rowStatus)`; ok -> plain
   `text-ink-muted`, warn/error -> chip with `rowStateClass(rowStateTone(...))`
   (`inline-flex rounded px-2 py-0.5 text-xs font-medium`). Keep the full status string in a
   `title` for debugging.
4. Sale-status select: add `statusPill(row.status)` classes to the select (`rounded px-2
   py-1 text-xs font-medium uppercase tracking-wide border-0`), options unchanged. Native
   `<option>` colours follow the OS; acceptable.
5. Recipient input: add `class:` branch using `needsRecipient(row)`: negative border,
   `bg-negative/10`, `aria-invalid="true"`, placeholder "Recipient required" (else "Name").
6. Input class constant `inputClass` for the repeated `rounded border border-line-strong
   bg-surface px-1` strings; table `thead` sticky (`sticky top-0 bg-surface-subtle`),
   wrapper `overflow-auto`, rows `border-t border-line`. Keep every handler and the
   `{#each rows as row, index (index)}` key as is.
7. Missing-matches `<details>` restyled (card: `rounded-lg border border-line bg-surface`),
   "+ add sale" as `min-h-11` text button. `addRow` untouched.
8. Result panel (after commit): same content, restyled as a card with the imported count in
   `text-positive-strong`, Undo import as secondary `Button`, Done as primary `Button`.
9. `npx svelte-check`, lint.

### Task 6: footer and manual verification

Files: modify `web/src/lib/ui/ImportSalesDraft.svelte`.

1. Footer: secondary `Button` "Cancel" -> `onCancel`; primary `Button` "Import {rows.length}
   sale(s)" (singular for 1) -> `importRows`, `disabled={!canImport}`, `loading={loading}`.
   Error message above the footer. Footer is sticky to the bottom of the dialog body.
2. Manual run against a prepared CSV covering: one row per sale status, a GIFTED row with no
   recipient (recipient cell highlighted, button disabled, summary "n need attention"), a date
   with no home match (label "No match on date"), an opponent mismatch (warning, button still
   enabled), a multi-ticket row with one pass. Fix the recipient: highlight clears, button
   enables. Delete a row: counts update. "+ add sale" from missing matches adds a PENDING
   row. Import, then Undo, then Done. Check 375 px and keyboard-only.
3. Full gates: `cd web && npx vitest run && npx svelte-check && npm run lint` (and the
   root build if the web workspace is included); confirm output, do not rely on exit 0
   alone for build.
4. Stage S3 and stop for `/crit`. Then run `show-me` on the final shape only if the diff
   spans many files (it will not).

---

## Independence

Frontend-only; no backend work. S1 first; S2 and S3 are sequenced (shared modal wiring), so
dispatch `frontend-builder` once per slice in order, not in parallel.
