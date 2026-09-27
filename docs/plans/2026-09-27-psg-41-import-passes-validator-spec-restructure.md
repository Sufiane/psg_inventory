# PSG-41 import-passes validator spec restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `src/api/sales-import/shared/import-passes.validator.spec.ts` from flat `it()`-per-branch titles into `describe('when …')` nesting per the repo's documented test-structure convention, with zero change to assertions or coverage.

**Architecture:** Single test file edit. The class-level `describe('ImportPassesValidator')` gains a method-level `describe('validate')` (mirroring the PSG-37 fix in `get-amortization.usecase.spec.ts`), under which each of the four existing tests moves into its own `describe('when …')` block with a condition-free, outcome-only `it` title. Setup, mocks, fixtures, and every `expect` stay exactly where and how they are.

**Tech Stack:** Vitest (`globals: true`, so `describe`/`it`/`expect` are unimported), NestJS `Test.createTestingModule`, `vitest-mock-extended`.

**Spec:** `docs/specs/2026-09-27-psg-41-import-passes-validator-spec-restructure-design.md`

## Global Constraints

- Touch exactly one file: `src/api/sales-import/shared/import-passes.validator.spec.ts`. No production code, no config, no other spec.
- Exactly 4 tests before and after; no `expect(...)`, `mock*`, fixture, or `beforeEach` line may change content — only indentation may change.
- `it` titles state only the outcome; conditions live in `describe('when …')` titles.
- The top-level `beforeEach` (testing module build, `module.get(...)`, `useLogger(false)`) is left byte-identical; per-test mock wiring stays inside each `it`.
- Verification gates, all must pass: single-file vitest run (4 passed), `npm test`, `npm run typecheck`, `npm run lint`.
- Commit message follows the repo's conventional-commits style, e.g. the PSG-37 precedent: `test(sales-import): nest import-passes validator spec by branch (PSG-41)`.

---

### Task 1: Capture the baseline (green before touching anything)

**Files:**
- Read only: `src/api/sales-import/shared/import-passes.validator.spec.ts`

**Interfaces:**
- Consumes: nothing (repo state on the current branch).
- Produces: a recorded baseline — "4 tests pass" — that Task 2's verification is compared against.

- [ ] **Step 1: Run the target spec alone and record the count**

Run:
```bash
npx vitest run src/api/sales-import/shared/import-passes.validator.spec.ts
```
Expected: PASS, `4 passed`. If it is not 4 or not green, stop — the baseline is broken and restructuring must not begin.

- [ ] **Step 2: Confirm the working tree starts clean for this file**

Run:
```bash
git status --short src/api/sales-import/shared/import-passes.validator.spec.ts
```
Expected: no output (file unmodified). Any existing diff means someone else's change is in flight — surface it before proceeding.

---

### Task 2: Restructure the spec into describe-per-branch

**Files:**
- Modify: `src/api/sales-import/shared/import-passes.validator.spec.ts` (whole file — lines 1–91)

**Interfaces:**
- Consumes: baseline from Task 1 (4 passing tests).
- Produces: the same public surface as before — one exported nothing (spec file), suite still named `describe('ImportPassesValidator')`, still 4 tests. No other file imports this one.

- [ ] **Step 1: Replace the flat `it()` list with the nested structure**

Rewrite the file to exactly this content (lines 1–49 — imports, `describe('ImportPassesValidator')`, `passFixture`, top-level `beforeEach` — are unchanged apart from the added `describe('validate')` opening line; everything from the first test on is replaced):

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { ImportPassesValidator } from './import-passes.validator';
import { ISeasonPassesDbService } from '../../../db/season-passes/season-passes.db.interface';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import type { SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonPass } from '../../../db/season-passes/type/season-pass.type';

describe('ImportPassesValidator', () => {
    let validator: ImportPassesValidator;
    let passesDb: DeepMockProxy<ISeasonPassesDbService>;

    const userId = 'user-1' as UserId;
    const passAId = '11111111-1111-1111-1111-111111111111';
    const passBId = '22222222-2222-2222-2222-222222222222';

    function passFixture(overrides: Partial<SeasonPass> = {}): SeasonPass {
        return {
            id: passAId as SeasonPassId,
            userId,
            seasonStartYear: 2025,
            price: 800,
            label: 'A',
            category: 'A',
            row: '1',
            seat: '1',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides,
        } as SeasonPass;
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                ImportPassesValidator,
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<ISeasonPassesDbService>(),
                },
            ],
        }).compile();

        validator = module.get(ImportPassesValidator);
        passesDb = module.get(ISeasonPassesDbService);

        module.useLogger(false);
    });

    describe('validate', () => {
        describe('when every pass is owned and same-season', () => {
            it('returns the single season year', async () => {
                passesDb.findById.mockResolvedValue(passFixture());

                await expect(validator.validate(userId, [passAId])).resolves.toBe(2025);
            });
        });

        describe('when a pass does not exist', () => {
            it('throws SEASON_PASS_NOT_FOUND', async () => {
                passesDb.findById.mockResolvedValue(null);

                await expect(validator.validate(userId, [passAId])).rejects.toMatchObject({
                    code: ErrorCode.SEASON_PASS_NOT_FOUND,
                });
            });
        });

        describe('when the pass belongs to another user', () => {
            it('throws SEASON_PASS_FORBIDDEN', async () => {
                passesDb.findById.mockResolvedValue(
                    passFixture({ userId: 'other-user' as UserId }),
                );

                await expect(validator.validate(userId, [passAId])).rejects.toMatchObject({
                    code: ErrorCode.SEASON_PASS_FORBIDDEN,
                });
            });
        });

        describe('when the passes differ in season year', () => {
            it('throws IMPORT_PASSES_MIXED_SEASONS', async () => {
                passesDb.findById.mockImplementation(async (id) => {
                    if (id === passBId) {
                        return passFixture({
                            id: passBId as SeasonPassId,
                            seasonStartYear: 2024,
                        });
                    }

                    return passFixture({});
                });

                await expect(
                    validator.validate(userId, [passAId, passBId]),
                ).rejects.toMatchObject({ code: ErrorCode.IMPORT_PASSES_MIXED_SEASONS });
            });
        });
    });
});
```

Title mapping this encodes (old flat `it` → new `describe` / `it`), for review reference:

| Old `it(...)` | New `describe('when …')` | New `it(…)` |
|---|---|---|
| `returns the single season year when every pass is owned and same-season` | `when every pass is owned and same-season` | `returns the single season year` |
| `throws SEASON_PASS_NOT_FOUND when a pass does not exist` | `when a pass does not exist` | `throws SEASON_PASS_NOT_FOUND` |
| `throws SEASON_PASS_FORBIDDEN when pass belongs to other user` | `when the pass belongs to another user` | `throws SEASON_PASS_FORBIDDEN` |
| `throws IMPORT_PASSES_MIXED_SEASONS when passes differ in year` | `when the passes differ in season year` | `throws IMPORT_PASSES_MIXED_SEASONS` |

- [ ] **Step 2: Audit the diff for assertion drift**

Run:
```bash
git diff src/api/sales-import/shared/import-passes.validator.spec.ts
```
Expected: the diff contains only (a) added `describe(...)` lines, (b) removed old `it('… condition …')` lines and their replacement `it('… outcome …')` lines, (c) indentation changes. Zero lines changing `expect(`, `mockResolvedValue`, `mockImplementation`, `passFixture`, `ErrorCode`, or the `beforeEach` block's content. If any assertion/setup line changed beyond indentation, revert it.

- [ ] **Step 3: Run the target spec and verify the count is unchanged**

Run:
```bash
npx vitest run src/api/sales-import/shared/import-passes.validator.spec.ts
```
Expected: PASS, `4 passed` — same count as Task 1 baseline.

---

### Task 3: Full verification, then commit

**Files:**
- None modified beyond Task 2's file; this task only runs gates and commits.

**Interfaces:**
- Consumes: restructured spec from Task 2.
- Produces: one commit on the current branch containing only the spec file.

- [ ] **Step 1: Run the full unit suite**

Run:
```bash
npm test
```
Expected: PASS, no failures anywhere in `src/**/*.spec.ts`.

- [ ] **Step 2: Run typecheck**

Run:
```bash
npm run typecheck
```
Expected: clean, exit 0.

- [ ] **Step 3: Run lint**

Run:
```bash
npm run lint
```
Expected: clean, `--max-warnings 0` satisfied (no title-content ESLint rule exists; this catches indentation/format slip).

- [ ] **Step 4: Optional coverage cross-check**

Run:
```bash
npx vitest run --coverage src/api/sales-import/shared/import-passes.validator.spec.ts
```
Expected: `src/api/sales-import/shared/import-passes.validator.ts` shows the same branch/line coverage as before (all 4 branches of `validate()` hit). Skip if coverage provider is slow/unavailable locally — Tasks 1–3 already prove equivalence.

- [ ] **Step 5: Commit**

```bash
git add src/api/sales-import/shared/import-passes.validator.spec.ts docs/specs/2026-09-27-psg-41-import-passes-validator-spec-restructure-design.md docs/plans/2026-09-27-psg-41-import-passes-validator-spec-restructure.md
# (add docs/tech-debt.md too only if Step 6 actually deleted an entry from it)
git commit -m "test(sales-import): nest import-passes validator spec by branch (PSG-41)"
```

- [ ] **Step 6: Record completion in the tech-debt ledger**

The issue came from the 2026-09-27 repo-wide audit. If the audit's entry for this spec exists in `docs/tech-debt.md` at execution time, delete it (per that file's "Delete it when it's done" rule). If no such entry exists (PSG-41 was filed directly to Linear), skip this step — do not invent an entry.
