# PSG-41 — Restructure `import-passes.validator.spec.ts` into describe-per-branch

**Date:** 2026-09-27
**Linear:** PSG-41
**Found:** 2026-09-27 repo-wide tech-debt audit
**Scope:** one file, test-only. No production code, no behavior change.

## Problem

`src/api/sales-import/shared/import-passes.validator.spec.ts` is a flat
`it()`-per-branch spec: each `it()` title bakes the condition in alongside the
outcome, e.g.

```
it('throws IMPORT_PASSES_MIXED_SEASONS when passes differ in year', …)
```

The project's documented test-structure convention (stated verbatim in the
`docs/plans/*` convention headers — e.g. `docs/plans/2026-08-30-ask-a-question.md`,
line 22 — and documented as the repo standard referenced from `docs/tech-debt.md`
entry 5) requires:

> one `describe` per conditional branch, titled "when ...". `it` titles state
> only the outcome and never repeat the condition. Shared setup goes in that
> `describe`'s own `beforeEach`.

The current file matches the "bad" shape of that convention almost verbatim.
`docs/tech-debt.md` entry 5 records the identical defect in
`get-amortization.usecase.spec.ts` (Linear PSG-37), which was fixed in commit
`1ccc96d` / PR #62 — that commit is the precedent for this fix.

## Non-goals

- No changes to `import-passes.validator.ts` or any production file.
- No new tests, no deleted tests, no changed assertions, no changed mocks.
- No refactor of other flat specs (only PSG-41's file is in scope; other
  offenders from the audit get their own issues).
- No ESLint rule addition to mechanically enforce the convention.

## Invariants (what "done" cannot break)

1. **Same assertions.** Every `expect(...)` expression stays byte-identical;
   only indentation changes.
2. **Same coverage.** Exactly 4 tests before and after, exercising the same 4
   branches of `ImportPassesValidator.validate()`:
   - happy path → resolves `2025`
   - `pass == null` → throws `SEASON_PASS_NOT_FOUND`
   - `pass.userId !== userId` → throws `SEASON_PASS_FORBIDDEN`
   - `years.size !== 1` → throws `IMPORT_PASSES_MIXED_SEASONS`
   (These are all branches in `import-passes.validator.ts`, lines 24–40. The
   restructure adds nothing and drops nothing.)
3. **Same mocks/setup.** The top-level `beforeEach` (Nest testing module,
   `mockDeep<ISeasonPassesDbService>`, `module.useLogger(false)`) is untouched.
   Per-test mock wiring (`passesDb.findById.mockResolvedValue…`) stays inside
   each `it` — each branch has exactly one test, so there is no *shared* setup
   to hoist into a branch `beforeEach`.
4. **Same runner behavior.** Vitest with `globals: true`
   (`vitest.config.ts`), so `describe`/`it` remain unimported.

## Target structure

Mirrors the PSG-37 fix (`src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts`),
which layers `describe('<method>')` under the class describe before the
branch describes:

```
describe('ImportPassesValidator')
  └ describe('validate')                      ← method layer, as in the reference spec
      ├ describe('when every pass is owned and same-season')
      │    └ it('returns the single season year')
      ├ describe('when a pass does not exist')
      │    └ it('throws SEASON_PASS_NOT_FOUND')
      ├ describe('when the pass belongs to another user')
      │    └ it('throws SEASON_PASS_FORBIDDEN')
      └ describe('when the passes differ in season year')
           └ it('throws IMPORT_PASSES_MIXED_SEASONS')
```

Title mapping (old flat `it` → new `describe` / `it`):

| Old `it(...)` title | New `describe('when …')` | New `it(…)` |
|---|---|---|
| `returns the single season year when every pass is owned and same-season` | `when every pass is owned and same-season` | `returns the single season year` |
| `throws SEASON_PASS_NOT_FOUND when a pass does not exist` | `when a pass does not exist` | `throws SEASON_PASS_NOT_FOUND` |
| `throws SEASON_PASS_FORBIDDEN when pass belongs to other user` | `when the pass belongs to another user` | `throws SEASON_PASS_FORBIDDEN` |
| `throws IMPORT_PASSES_MIXED_SEASONS when passes differ in year` | `when the passes differ in season year` | `throws IMPORT_PASSES_MIXED_SEASONS` |

Condition text moves to the `describe` (prefixed `when …`), outcome text stays
in the `it`. Error codes are outcome, not condition — they stay in the `it`
titles.

## Error handling / risk

- **Risk: accidental assertion drift during the move.** Mitigation: verification
  requires `git diff` of the spec to show only added `describe` lines, removed
  old `it` lines, and re-indentation — no `expect`, `mock*`, or fixture line
  may change. Test count must read 4 both before and after.
- **Risk: a branch describe with setup that later gains a second test.**
  Out of scope now (1 test per branch); noted for future edits — new sibling
  tests in a branch should hoist shared setup into that branch's `beforeEach`
  per convention.
- Behavior of the suite is unchanged: `describe`/`beforeEach` nesting does not
  alter execution order semantics here (no `beforeEach` is nested, mocks are
  set inside each `it`).

## Testing / verification

- `npx vitest run src/api/sales-import/shared/import-passes.validator.spec.ts`
  → 4 passed, same as before the change.
- `npm test` (full suite) → green; nothing else imports this spec.
- `npm run typecheck` → clean.
- `npm run lint` → clean (no ESLint rule constrains test titles today; this
  guards against prettier/indentation slip).
- `npm run test:cov` optional cross-check: coverage of
  `import-passes.validator.ts` unchanged (4/4 branches).

## Deliverables

- Spec: `docs/specs/2026-09-27-psg-41-import-passes-validator-spec-restructure-design.md`
- Plan: `docs/plans/2026-09-27-psg-41-import-passes-validator-spec-restructure.md`
