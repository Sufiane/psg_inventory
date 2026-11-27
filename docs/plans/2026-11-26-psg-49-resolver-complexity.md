# PSG-49 Resolver Complexity Implementation Plan

> **For agentic workers:** execute task-by-task; checkbox steps. Spec: `docs/specs/2026-11-26-psg-49-resolver-complexity-design.md`.

**Goal:** Drop `validateCommitRows` (23) and `resolveDraftRows` (27) to ≤15 via module-level helpers, then lower the `sonarjs/cognitive-complexity` ratchet 27 → 18. No behavior change.

**Size:** ~250 lines total (resolver ±130, spec +~90, eslint 1). Single PR, backend only.

**Files:**
- Modify: `src/api/sales-import/sales-import.resolver.ts`
- Modify (additions only): `src/api/sales-import/sales-import.resolver.spec.ts`
- Modify: `eslint.config.mjs` (line 37)

**Style reminders:** explicit return types on every function; no single-letter names; braced `if`; blank line before `if`/`for`/`return`/`throw` unless first in block; no nested function declarations; no new comments; conventional commits.

---

### Task 1: Characterization tests for `validateCommitRows`

Current code must pass these unchanged — they lock behavior before the refactor.

- [ ] **Step 1:** In the spec, inside the existing top-level `describe('validateCommitRows')`, add sibling `describe` blocks (reuse the file's existing fixtures/builders for `Match`, `DraftRowDto`, pass ids). One `describe('when …')` per condition, short `it` titles:
  - when a cell is invalid (e.g. `nbTickets: 0`) → `rowStatus` `error:invalid-cell`; and when that row carries a client `matchId` → it is passed through unchanged.
  - when no home match is on the date → `error:match-missing`, no `matchId`.
  - when the single match's opponent name differs → `warn:opponent-mismatch`, `matchId` set.
  - when allocations are empty / sum ≠ `nbTickets` / reference an unselected pass → `error:unallocated` (one `it` each).
  - when the match errors and allocations are also invalid → reports the match error (precedence).
  - when soldAt is after the match date (SOLD row) → `error:sold-after-kickoff`.
  - when the opponent mismatches and soldAt is after kickoff → `error:sold-after-kickoff` (soldAt beats match warning).
  - summary: mixed rows → `{ total, errors, warnings }` exact.
- [ ] **Step 2:** `npx vitest run src/api/sales-import/sales-import.resolver.spec.ts` → all PASS on unmodified resolver. If any fails, the test is wrong (fix the test, not the code).
- [ ] **Step 3:** Commit `test(sales-import): characterize validateCommitRows status precedence`.

### Task 2: Shared helpers

- [ ] **Step 1:** Add module-level functions in the resolver (above `validateCommitRows`):

```ts
function errorOnly(status: DraftRowStatus | null): DraftRowStatus | null
function firstStatus(candidates: ReadonlyArray<DraftRowStatus | null>): DraftRowStatus  // find(!= null) ?? 'ok'
function countIssues(rows: DraftRowDto[]): { errors: number; warnings: number }       // filter by rowStatus prefix
```

- [ ] **Step 2:** Not wired yet; `npx tsc --noEmit -p tsconfig.json` may flag unused — proceed straight to Task 3 before running checks.

### Task 3: Refactor `validateCommitRows`

- [ ] **Step 1:** Add `toCommitRaw(row: DraftRowDto)` returning the exact object literal currently built at lines 198–208 (return type: inline object type or `RawImportRow`-compatible shape — must satisfy `isInvalidRow`, `resolveMatch`, `resolveGiftRecipientStatus`, `resolveSoldAtStatus`).
- [ ] **Step 2:** Add `hasValidAllocations(row: DraftRowDto, selected: Set<string>): boolean` = `length > 0 && sum === row.nbTickets && every(selected.has)`.
- [ ] **Step 3:** Add `validateCommitRow(row, byDate, selected): DraftRowDto`:
  1. `raw = toCommitRaw(row)`; if `isInvalidRow(raw)` → return `{ ...row, rowStatus: 'error:invalid-cell' }`.
  2. `{ match, status: matchStatus } = resolveMatch(raw, byDate)`; `matchIdSpread = match != null ? { matchId: match.id } : {}`.
  3. If `matchStatus?.startsWith('error:')` → return `{ ...row, ...matchIdSpread, rowStatus: matchStatus }`. **Must stay an early return** (lazy evaluation, spec invariant 2).
  4. `rowStatus = firstStatus([hasValidAllocations(row, selected) ? null : 'error:unallocated', resolveGiftRecipientStatus(raw), resolveSoldAtStatus(raw, match), matchStatus])`.
  5. Return `{ ...row, ...matchIdSpread, rowStatus }`.
- [ ] **Step 4:** Rewrite `validateCommitRows` body: `byDate`, `selected`, `rows = input.rows.map((row) => validateCommitRow(row, byDate, selected))`, `{ errors, warnings } = countIssues(rows)`, return `{ rows, summary: { total: input.rows.length, errors, warnings } }`.
- [ ] **Step 5:** Update the comment above `resolveGiftRecipientStatus`: `validateCommitRows` → `validateCommitRow`. No other comment changes.
- [ ] **Step 6:** `npx vitest run src/api/sales-import/sales-import.resolver.spec.ts` → PASS.

### Task 4: Refactor `resolveDraftRows`

- [ ] **Step 1:** Add `toDraftRowBase(raw: RawImportRow)` returning `{ rowIndex, date, opponent, listedPrice, nbTickets, invest, status, ...(soldAt spread), ...(recipient spread) }` — same key order as today. Return type: `Omit<DraftRowDto, 'allocations' | 'rowStatus' | 'matchId'>` (adjust to whatever compiles cleanly against the DTO).
- [ ] **Step 2:** Add `resolveDraftRow(raw, byDate, selectedPassIds: string[]): DraftRowDto`:
  1. If `isInvalidRow(raw)` → return `{ ...toDraftRowBase(raw), allocations: [], rowStatus: 'error:invalid-cell' }`.
  2. Compute `{ match, status: matchStatus }`, `allocationResult`, `giftRecipientStatus`, `soldAtStatus` (eager, as today).
  3. `rowStatus = firstStatus([errorOnly(matchStatus), errorOnly(allocationResult.status), giftRecipientStatus, soldAtStatus, matchStatus, allocationResult.status])`.
  4. Return `{ ...toDraftRowBase(raw), ...(match != null ? { matchId: match.id } : {}), allocations: allocationResult.allocations, rowStatus }`.
- [ ] **Step 3:** Add `findMissingMatches(homeMatches: Match[], rows: DraftRowDto[]): MissingMatch[]` — build `Set` of non-null `row.matchId`, then the existing filter/map over `homeMatches`.
- [ ] **Step 4:** Rewrite `resolveDraftRows`: `byDate`, `rows = input.rawRows.map(...)`, `countIssues`, `findMissingMatches(input.homeMatches, rows)`, return same shape with `total: input.rawRows.length`.
- [ ] **Step 5:** `npx vitest run src/api/sales-import/sales-import.resolver.spec.ts` → PASS. `git diff src/api/sales-import/sales-import.resolver.spec.ts` shows only Task 1 additions.

### Task 5: Measure and lower the ratchet

- [ ] **Step 1:** Temporarily set `eslint.config.mjs` line 37 to `['error', 15]`, run `npx eslint src scripts`. Expected: only `scripts/ungift-sale.ts` (18) reported; nothing in `sales-import.resolver.ts`. If a resolver helper exceeds 15, split it further before continuing.
- [ ] **Step 2:** Set the value to `['error', 18]`. Run `npx eslint src scripts` → clean. (Sanity: at 17 it should fail only on `ungift-sale.ts`.)
- [ ] **Step 3:** Full gates: `npm run lint`, `npm test`, `npm run lint:deps`, `npm run build && test -f dist/main.js`.
- [ ] **Step 4:** Commit resolver + eslint together: `refactor(sales-import): extract per-row helpers from resolver` (or split into `refactor(...)` + `chore(eslint): lower cognitive-complexity ratchet to 18`). Stage and stop for `/crit` per user workflow.
