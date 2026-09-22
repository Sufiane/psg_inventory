# PSG-26: Extract `SalesImportService.commit` into its own usecase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `SalesImportService.commit` and its helpers into `src/api/sales-import/usecases/commit-sales-import/` (`commit-sales-import.usecase.ts` + `commit-sales-import.usecase.db.ts`), sharing the two helpers that `preview`/`revert` still need via a new `sales-import/shared/` folder — zero runtime change.

**Architecture:** Three independently-green tasks: (1) `assertPasses` → shared `ImportPassesValidator`; (2) `invalidateImportCaches` → shared `ImportCacheInvalidator`; (3) the commit pipeline + `buildGiftInput` → `CommitSalesImportUsecase` behind a two-method `ICommitSalesImportUsecaseDb` wrapper over the existing db tokens, registered in a colocated `commit-sales-import.usecase.module.ts` imported by `sales-import.module.ts` (one module per usecase, per PSG-24 — spec D1, user-approved), with `commit` becoming a one-line delegate. Call direction: controller → service → usecase → usecase's own db.

**Tech Stack:** NestJS modules/DI, TypeScript, Vitest (`vitest-mock-extended` deep mocks), dependency-cruiser, ESLint, tsc.

**Spec:** `docs/specs/2026-09-22-psg-26-commit-sales-import-usecase-extraction-design.md`

## Global Constraints

- Backend-only: no file under `web/` may change.
- Net-zero behavior: no API shape, error code, cache key, response, or status change. Helper bodies and their comments move **verbatim** — only path-relative imports and class wrappers change.
- `commit-sales-import.usecase.ts` must not import `@prisma/client`, `PrismaService`, or any runtime member of `src/db/**` (type-only imports from `src/db` are legal).
- `commit-sales-import.usecase.db.ts` wraps `IMatchesDbService` + `ISalesImportDbService` only — it never imports Prisma, and it must **not** expose `deleteBatch` (spec D4).
- Registration: the usecase pair + both shared collaborators are providers of a new colocated `commit-sales-import.usecase.module.ts` (exports `ICommitSalesImportUsecase`); `sales-import.module.ts` imports it and keeps its four existing db-module imports, with `ImportPassesValidator` + `ImportCacheInvalidator` also in its own `providers` for `preview`/`revert` (spec D1 — one module per usecase, per PSG-24).
- Files not listed under any task's "Files" must not change (`sales-import.controller.ts`, `sales-import.resolver.ts`, `sales-import.csv.ts`, DTOs, everything under `src/db/`, `src/redis/`, `.dependency-cruiser.cjs`, all of `web/`).
- Error codes stay exactly: `SEASON_PASS_NOT_FOUND`, `SEASON_PASS_FORBIDDEN`, `IMPORT_PASSES_MIXED_SEASONS`, `IMPORT_ROWS_INVALID`, `IMPORT_CSV_INVALID`.
- Formatting: 4-space indent, single quotes, matching neighboring files.
- Full gate must pass before every task is called done: `npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js`.

---

### Task 1: Extract `assertPasses` into shared `ImportPassesValidator` and rewire `preview` + `commit`

`assertPasses` is called by both `preview` (line 53) and `commit` (line 70), so it moves to a shared injectable (spec D3), not into the usecase. This task leaves `commit` inline — it just switches which helper it calls. The service loses its `ISeasonPassesDbService` dependency here.

**Files:**
- Create: `src/api/sales-import/shared/import-passes.validator.ts`
- Create: `src/api/sales-import/shared/import-passes.validator.spec.ts`
- Modify: `src/api/sales-import/sales-import.service.ts` (constructor, `preview`, `commit`, delete `assertPasses`, imports)
- Modify: `src/api/sales-import/sales-import.module.ts` (add one provider)
- Modify: `src/api/sales-import/sales-import.service.spec.ts` (add one provider line)

**Interfaces:**
- Consumes (exists, unchanged): `ISeasonPassesDbService.findById(id: SeasonPassId): Promise<SeasonPass | null>` from `src/db/season-passes/season-passes.db.interface.ts`.
- Produces (Task 2 and Task 3 rely on this): class `ImportPassesValidator`, method `validate(userId: UserId, selectedPassIds: string[]): Promise<SeasonYear>`, registered as itself in `SalesImportModule.providers`. It throws `DomainException` with codes `SEASON_PASS_NOT_FOUND` / `SEASON_PASS_FORBIDDEN` / `IMPORT_PASSES_MIXED_SEASONS` — identical to the deleted private method.

- [ ] **Step 1: Write the failing spec**

Create `src/api/sales-import/shared/import-passes.validator.spec.ts`:

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

    it('returns the single season year when every pass is owned and same-season', async () => {
        passesDb.findById.mockResolvedValue(passFixture());

        await expect(validator.validate(userId, [passAId])).resolves.toBe(2025);
    });

    it('throws SEASON_PASS_NOT_FOUND when a pass does not exist', async () => {
        passesDb.findById.mockResolvedValue(null);

        await expect(validator.validate(userId, [passAId])).rejects.toMatchObject({
            code: ErrorCode.SEASON_PASS_NOT_FOUND,
        });
    });

    it('throws SEASON_PASS_FORBIDDEN when pass belongs to other user', async () => {
        passesDb.findById.mockResolvedValue(
            passFixture({ userId: 'other-user' as UserId }),
        );

        await expect(validator.validate(userId, [passAId])).rejects.toMatchObject({
            code: ErrorCode.SEASON_PASS_FORBIDDEN,
        });
    });

    it('throws IMPORT_PASSES_MIXED_SEASONS when passes differ in year', async () => {
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
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx vitest run src/api/sales-import/shared/import-passes.validator.spec.ts`
Expected: FAIL — `Failed to resolve import "./import-passes.validator"` (file does not exist).

- [ ] **Step 3: Implement the validator (body moved verbatim from `SalesImportService.assertPasses`, lines 144–170)**

Create `src/api/sales-import/shared/import-passes.validator.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { ISeasonPassesDbService } from '../../../db/season-passes/season-passes.db.interface';

// Moved verbatim from SalesImportService.assertPasses (PSG-26): both
// SalesImportService.preview and CommitSalesImportUsecase need exactly this
// check, so it lives in the module's shared folder (mirroring
// src/api/sales/shared/sale-allocations.validator.ts) rather than inside one
// usecase's internals.
@Injectable()
export class ImportPassesValidator {
    constructor(private readonly seasonPassesDb: ISeasonPassesDbService) {}

    async validate(userId: UserId, selectedPassIds: string[]): Promise<SeasonYear> {
        const passes = await Promise.all(
            selectedPassIds.map((id) => this.seasonPassesDb.findById(id as SeasonPassId)),
        );
        const years = new Set<number>();

        for (const pass of passes) {
            if (pass == null) {
                throw new DomainException(ErrorCode.SEASON_PASS_NOT_FOUND);
            }

            if (pass.userId !== userId) {
                throw new DomainException(ErrorCode.SEASON_PASS_FORBIDDEN);
            }

            years.add(pass.seasonStartYear);
        }

        if (years.size !== 1) {
            throw new DomainException(ErrorCode.IMPORT_PASSES_MIXED_SEASONS);
        }

        return [...years][0]! as SeasonYear;
    }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `npx vitest run src/api/sales-import/shared/import-passes.validator.spec.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Rewire `sales-import.service.ts`**

Five edits, all in `src/api/sales-import/sales-import.service.ts`:

1. Remove the imports of `ISeasonPassesDbService` (line 16) and of `SeasonYear` (`import type { SeasonYear } from '@psg/shared/time';`, line 7 — nothing references it once `assertPasses` is gone; leaving it would fail `lint`'s unused-import rule) and add:
   ```ts
   import { ImportPassesValidator } from './shared/import-passes.validator';
   ```
2. Replace the constructor (lines 35–40) with:
   ```ts
   constructor(
       private readonly matchesDb: IMatchesDbService,
       private readonly salesImportDb: ISalesImportDbService,
       private readonly passesValidator: ImportPassesValidator,
   ) {}
   ```
3. In `preview` (line 53): `const seasonStartYear = await this.passesValidator.validate(userId, selectedPassIds);`
4. In `commit` (line 70): `const seasonStartYear = await this.passesValidator.validate(userId, dto.selectedPassIds);`
5. Delete the whole `private async assertPasses(...)` method (lines 144–170).

- [ ] **Step 6: Register the validator in `sales-import.module.ts`**

Add `ImportPassesValidator` (import path `./shared/import-passes.validator`) to `providers`, after `SalesImportService`. The `imports` array does not change.

```ts
@Module({
    imports: [MatchesDbModule, SeasonPassesDbModule, RedisModule, SalesImportDbModule],
    controllers: [SalesImportController],
    providers: [SalesImportService, ImportPassesValidator],
})
export class SalesImportModule {}
```

- [ ] **Step 7: Add the validator to the service spec's testing module**

In `src/api/sales-import/sales-import.service.spec.ts`: add `import { ImportPassesValidator } from './shared/import-passes.validator';` and add it to the `providers` array right after `SalesImportService`:

```ts
providers: [
    SalesImportService,
    ImportPassesValidator,
    { provide: IMatchesDbService, useValue: matchesDb },
    { provide: ISeasonPassesDbService, useValue: passesDb },
    { provide: ISalesImportDbService, useValue: importDb },
    { provide: RedisService, useValue: redisService },
],
```

Nothing else in the spec changes: `passesDb` stays because the real validator injects it, so every existing `preview`/`commit` assertion runs through the same logic as before.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites, including the untouched `commit` and `preview` blocks (behavior identical).

- [ ] **Step 9: Verify no stray references**

Run: `grep -rn "assertPasses" src/api/sales-import --include='*.ts'`
Expected: no output.

- [ ] **Step 10: Run the full gate**

Run: `npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js && echo GATE_OK`
Expected: `GATE_OK`.

- [ ] **Step 11: Commit**

```bash
git add src/api/sales-import/shared/import-passes.validator.ts \
        src/api/sales-import/shared/import-passes.validator.spec.ts \
        src/api/sales-import/sales-import.service.ts \
        src/api/sales-import/sales-import.module.ts \
        src/api/sales-import/sales-import.service.spec.ts
git commit -m "refactor(sales-import): move pass validation into a shared validator (PSG-26)"
```

---

### Task 2: Extract `invalidateImportCaches` into shared `ImportCacheInvalidator` and rewire `commit` + `revert`

Same shape as Task 1. `invalidateImportCaches` is called by `commit` (line 110) and `revert` (line 120, which stays on the service), so it moves to a shared injectable (spec D3). The service loses its `RedisService` dependency here.

**Files:**
- Create: `src/api/sales-import/shared/import-cache.invalidator.ts`
- Create: `src/api/sales-import/shared/import-cache.invalidator.spec.ts`
- Modify: `src/api/sales-import/sales-import.service.ts` (constructor, `commit`, `revert`, delete `invalidateImportCaches`, imports)
- Modify: `src/api/sales-import/sales-import.module.ts` (add one provider)
- Modify: `src/api/sales-import/sales-import.service.spec.ts` (add one provider line)

**Interfaces:**
- Consumes (exists, unchanged): `RedisService.invalidatePattern(pattern)` from `src/redis/redis.service.ts`; `CACHE_KEYS.invalidateAccounting(userId)` / `CACHE_KEYS.invalidateRecipients(userId)` from `src/redis/CACHE_KEYS`.
- Produces (Task 3 relies on this): class `ImportCacheInvalidator`, method `afterWrite(userId: UserId): Promise<void>`, registered as itself in `SalesImportModule.providers`.

- [ ] **Step 1: Write the failing spec**

Create `src/api/sales-import/shared/import-cache.invalidator.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { ImportCacheInvalidator } from './import-cache.invalidator';
import { RedisService } from '../../../redis/redis.service';
import CACHE_KEYS from '../../../redis/CACHE_KEYS';
import type { UserId } from '@psg/shared/ids';

describe('ImportCacheInvalidator', () => {
    let invalidator: ImportCacheInvalidator;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'user-1' as UserId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                ImportCacheInvalidator,
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        invalidator = module.get(ImportCacheInvalidator);
        redisService = module.get(RedisService);

        module.useLogger(false);
    });

    it('invalidates the accounting and recipients caches', async () => {
        await invalidator.afterWrite(userId);

        expect(redisService.invalidatePattern).toHaveBeenCalledTimes(2);
        expect(redisService.invalidatePattern).toHaveBeenCalledWith(
            CACHE_KEYS.invalidateAccounting(userId),
        );
        expect(redisService.invalidatePattern).toHaveBeenCalledWith(
            CACHE_KEYS.invalidateRecipients(userId),
        );
    });

    it('does not propagate a redis failure (Promise.allSettled semantics)', async () => {
        redisService.invalidatePattern.mockRejectedValue(new Error('redis down'));

        await expect(invalidator.afterWrite(userId)).resolves.toBeUndefined();
    });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx vitest run src/api/sales-import/shared/import-cache.invalidator.spec.ts`
Expected: FAIL — `Failed to resolve import "./import-cache.invalidator"`.

- [ ] **Step 3: Implement the invalidator (body + comment moved verbatim from lines 126–142)**

Create `src/api/sales-import/shared/import-cache.invalidator.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { UserId } from '@psg/shared/ids';
import CACHE_KEYS from '../../../redis/CACHE_KEYS';
import { RedisService } from '../../../redis/redis.service';

// A committed or reverted batch can create or destroy GIFTED rows, so
// every cache an ordinary sale write would touch (spec D15,
// SalesService.updateSale's own invalidateAfterWrite) has to move here
// too. The sales list/detail cache is invalidated by the db layer
// (src/db/sales-import/sales-import.db.ts), mirroring how
// src/db/sales/sales.db.ts owns its own row-shaped caches; accounting
// and the recipients list (its giftCount sort key) are derived views only
// the api layer knows changed — invalidated unconditionally rather than
// trying to work out from the batch contents whether a recipient's count
// actually moved, since a wrong "no" here is a stale combobox for up to an
// hour and the extra invalidation call costs nothing on this rare a path.
// Moved verbatim from SalesImportService.invalidateImportCaches (PSG-26):
// CommitSalesImportUsecase and SalesImportService.revert both call it.
@Injectable()
export class ImportCacheInvalidator {
    constructor(private readonly redisService: RedisService) {}

    async afterWrite(userId: UserId): Promise<void> {
        await Promise.allSettled([
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateAccounting(userId)),
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateRecipients(userId)),
        ]);
    }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `npx vitest run src/api/sales-import/shared/import-cache.invalidator.spec.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Rewire `sales-import.service.ts`**

Five edits in `src/api/sales-import/sales-import.service.ts`:

1. Remove the imports of `RedisService` (line 18) and `CACHE_KEYS` (line 17) and add:
   ```ts
   import { ImportCacheInvalidator } from './shared/import-cache.invalidator';
   ```
2. Replace the constructor with:
   ```ts
   constructor(
       private readonly matchesDb: IMatchesDbService,
       private readonly salesImportDb: ISalesImportDbService,
       private readonly passesValidator: ImportPassesValidator,
       private readonly cacheInvalidator: ImportCacheInvalidator,
   ) {}
   ```
3. In **both** call sites — the one in `commit` and the one in `revert` (they read `await this.invalidateImportCaches(userId);`) — replace with `await this.cacheInvalidator.afterWrite(userId);`. The replacement is identical at both sites, so a replace-all of that exact statement is safe.
5. Delete the whole `private async invalidateImportCaches(...)` method **including the long comment block directly above it** (the comment now lives on the invalidator). It is the only remaining occurrence of the name after item 3.

- [ ] **Step 6: Register the invalidator in `sales-import.module.ts`**

Add `ImportCacheInvalidator` (import path `./shared/import-cache.invalidator`) to `providers`:

```ts
providers: [SalesImportService, ImportPassesValidator, ImportCacheInvalidator],
```

`imports` array still unchanged.

- [ ] **Step 7: Add the invalidator to the service spec's testing module**

In `src/api/sales-import/sales-import.service.spec.ts`: add `import { ImportCacheInvalidator } from './shared/import-cache.invalidator';` and add it to `providers` after `ImportPassesValidator`:

```ts
providers: [
    SalesImportService,
    ImportPassesValidator,
    ImportCacheInvalidator,
    { provide: IMatchesDbService, useValue: matchesDb },
    { provide: ISeasonPassesDbService, useValue: passesDb },
    { provide: ISalesImportDbService, useValue: importDb },
    { provide: RedisService, useValue: redisService },
],
```

`redisService` stays because the real invalidator injects it, so every existing `commit`/`revert` cache assertion runs unchanged.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — the `commit` and `revert` invalidation assertions still see the exact `CACHE_KEYS` calls.

- [ ] **Step 9: Verify no stray references**

Run: `grep -rn "invalidateImportCaches\|CACHE_KEYS\|RedisService" src/api/sales-import/sales-import.service.ts`
Expected: no output.

- [ ] **Step 10: Run the full gate**

Run: `npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js && echo GATE_OK`
Expected: `GATE_OK`.

- [ ] **Step 11: Commit**

```bash
git add src/api/sales-import/shared/import-cache.invalidator.ts \
        src/api/sales-import/shared/import-cache.invalidator.spec.ts \
        src/api/sales-import/sales-import.service.ts \
        src/api/sales-import/sales-import.module.ts \
        src/api/sales-import/sales-import.service.spec.ts
git commit -m "refactor(sales-import): move import cache invalidation into a shared invalidator (PSG-26)"
```

---

### Task 3: Extract `commit` into `CommitSalesImportUsecase` and thin the service

After Tasks 1–2, `commit` (still inline) reads: validate passes (validator) → load matches (`matchesDb`) → `validateCommitRows` → map rows (+ `buildGiftInput`) → `bulkCreate` → conditional invalidation. This task moves that pipeline, plus `buildGiftInput`, into the usecase; the usecase's db file wraps the two queries behind a narrow abstract; `SalesImportService.commit` becomes a one-line delegate; the 12 ported tests move to the usecase spec.

**Files:**
- Create: `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.db.ts`
- Create: `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.db.spec.ts`
- Create: `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.ts`
- Create: `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.module.ts`
- Create: `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.spec.ts`
- Modify: `src/api/sales-import/sales-import.service.ts` (final state given in full below)
- Modify: `src/api/sales-import/sales-import.module.ts` (final state given in full below)
- Modify: `src/api/sales-import/sales-import.service.spec.ts` (`commit` block → delegation test; add usecase token provider)
- Test (existing, must stay green): `src/app.module.spec.ts`, `src/api/sales-import/sales-import.csv.spec.ts`, `src/api/sales-import/sales-import.resolver.spec.ts`, `src/db/sales-import/sales-import.db.spec.ts`

**Interfaces:**
- Consumes (from Tasks 1–2): `ImportPassesValidator.validate(userId, selectedPassIds): Promise<SeasonYear>`; `ImportCacheInvalidator.afterWrite(userId): Promise<void>`; both registered in `SalesImportModule.providers`.
- Consumes (exists, unchanged): `IMatchesDbService.getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]>`; `ISalesImportDbService.bulkCreate({userId, batchId, sales}): Promise<number>`; `validateCommitRows({rows, homeMatches, selectedPassIds})` from `./sales-import.resolver`; `dateOnlyToUtcNoon` from `./utils/date-only.util`; `computeProfit` from `../sales/shared/profit.util`.
- Produces:
  - `ICommitSalesImportUsecase` with `execute(userId: UserId, dto: CommitRequestDto): Promise<CommitResult>` — consumed by `SalesImportService`.
  - `CommitResult = { batchId: string; salesCreated: number }` — re-exported by `sales-import.service.ts` for the controller.
  - `ICommitSalesImportUsecaseDb` with `getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]>` and `bulkCreate({userId, batchId, sales}): Promise<number>` — consumed by the usecase.

- [ ] **Step 1: Write the failing db spec**

Create `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.db.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { CommitSalesImportUsecaseDb } from './commit-sales-import.usecase.db';
import { IMatchesDbService } from '../../../../db/matches/matches.db.interface';
import { ISalesImportDbService } from '../../../../db/sales-import/sales-import.db.interface';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import type { Match } from '../../../../db/matches/types/match.type';

describe('CommitSalesImportUsecaseDb', () => {
    let usecaseDb: CommitSalesImportUsecaseDb;
    let matchesDb: DeepMockProxy<IMatchesDbService>;
    let salesImportDb: DeepMockProxy<ISalesImportDbService>;

    const userId = 'user-uuid' as UserId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                CommitSalesImportUsecaseDb,
                { provide: IMatchesDbService, useValue: mockDeep<IMatchesDbService>() },
                {
                    provide: ISalesImportDbService,
                    useValue: mockDeep<ISalesImportDbService>(),
                },
            ],
        }).compile();

        usecaseDb = module.get(CommitSalesImportUsecaseDb);
        matchesDb = module.get(IMatchesDbService);
        salesImportDb = module.get(ISalesImportDbService);

        module.useLogger(false);
    });

    describe('getHomeMatchesForSeason', () => {
        it('delegates to IMatchesDbService with the season year', async () => {
            const matches = [{ id: 'match-1', date: new Date('2025-09-14') }] as Match[];
            matchesDb.getHomeMatchesForSeason.mockResolvedValue(matches);

            const result = await usecaseDb.getHomeMatchesForSeason(2025 as SeasonYear);

            expect(matchesDb.getHomeMatchesForSeason).toHaveBeenCalledWith(
                2025 as SeasonYear,
            );
            expect(result).toEqual(matches);
        });
    });

    describe('bulkCreate', () => {
        it('forwards userId, batchId and sales unchanged', async () => {
            salesImportDb.bulkCreate.mockResolvedValue(3);

            const payload = { userId, batchId: 'batch-1', sales: [] };
            const result = await usecaseDb.bulkCreate(payload);

            expect(salesImportDb.bulkCreate).toHaveBeenCalledWith(payload);
            expect(result).toBe(3);
        });

        it('does not expose deleteBatch (the revert-only query is unreachable here)', async () => {
            expect(usecaseDb).not.toHaveProperty('deleteBatch');
        });
    });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx vitest run src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.db.spec.ts`
Expected: FAIL — `Failed to resolve import "./commit-sales-import.usecase.db"`.

- [ ] **Step 3: Implement the usecase db file**

Create `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.db.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { IMatchesDbService } from '../../../../db/matches/matches.db.interface';
import type { Match } from '../../../../db/matches/types/match.type';
import {
    BulkSaleInput,
    ISalesImportDbService,
} from '../../../../db/sales-import/sales-import.db.interface';

// The commit usecase's entire db surface: exactly the two queries commit
// runs (PSG-26) — deliberately NOT the full ISalesImportDbService, which
// also carries deleteBatch for revert. It wraps the existing db tokens and
// never talks to Prisma directly: SalesImportDb stays the single
// implementation of the bulk transaction, so nothing is duplicated here.
export abstract class ICommitSalesImportUsecaseDb {
    abstract getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]>;
    abstract bulkCreate(payload: {
        userId: UserId;
        batchId: string;
        sales: BulkSaleInput[];
    }): Promise<number>;
}

@Injectable()
export class CommitSalesImportUsecaseDb implements ICommitSalesImportUsecaseDb {
    constructor(
        private readonly matchesDb: IMatchesDbService,
        private readonly salesImportDb: ISalesImportDbService,
    ) {}

    getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]> {
        return this.matchesDb.getHomeMatchesForSeason(seasonStartYear);
    }

    bulkCreate(payload: {
        userId: UserId;
        batchId: string;
        sales: BulkSaleInput[];
    }): Promise<number> {
        return this.salesImportDb.bulkCreate(payload);
    }
}
```

- [ ] **Step 4: Run the db spec to verify it passes**

Run: `npx vitest run src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.db.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Write the failing usecase spec**

Create `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.spec.ts`. This is the service spec's `commit` block (lines 136–419) ported: `importDb.bulkCreate` → `usecaseDb.bulkCreate`, `matchesDb.getHomeMatchesForSeason` → `usecaseDb.getHomeMatchesForSeason`, with the **real** validator and invalidator wired over mocked `ISeasonPassesDbService`/`RedisService` so every `CACHE_KEYS` and payload assertion survives verbatim:

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { CommitSalesImportUsecase } from './commit-sales-import.usecase';
import { ICommitSalesImportUsecaseDb } from './commit-sales-import.usecase.db';
import { ImportPassesValidator } from '../../shared/import-passes.validator';
import { ImportCacheInvalidator } from '../../shared/import-cache.invalidator';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { CommitRequestDto } from '../../dto/commit-request.dto';
import type { MatchId, OpponentId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Match } from '../../../../db/matches/types/match.type';
import type { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';

describe('CommitSalesImportUsecase', () => {
    let usecase: CommitSalesImportUsecase;
    let usecaseDb: DeepMockProxy<ICommitSalesImportUsecaseDb>;
    let passesDb: DeepMockProxy<ISeasonPassesDbService>;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'user-1' as UserId;
    const passAId = '11111111-1111-1111-1111-111111111111';
    const matchId = '33333333-3333-3333-3333-333333333333';

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

    function matchFixture(): Match {
        return {
            id: matchId as MatchId,
            opponentId: 'op-1' as OpponentId,
            atHome: true,
            date: new Date('2025-09-14'),
            competition: 'CHAMPIONSHIP',
            Opponent: { id: 'op-1' as OpponentId, name: 'Marseille' },
            MatchResults: null,
        } as unknown as Match;
    }

    const validDto: CommitRequestDto = {
        selectedPassIds: [passAId],
        rows: [
            {
                rowIndex: 0,
                date: '2025-09-14',
                opponent: 'Marseille',
                listedPrice: 120,
                nbTickets: 1,
                invest: 80,
                status: 'SOLD',
                matchId,
                allocations: [{ seasonPassId: passAId, nbTickets: 1 }],
                rowStatus: 'ok',
            },
        ],
    };

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                CommitSalesImportUsecase,
                ImportPassesValidator,
                ImportCacheInvalidator,
                {
                    provide: ICommitSalesImportUsecaseDb,
                    useValue: mockDeep<ICommitSalesImportUsecaseDb>(),
                },
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<ISeasonPassesDbService>(),
                },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usecase = module.get(CommitSalesImportUsecase);
        usecaseDb = module.get(ICommitSalesImportUsecaseDb);
        passesDb = module.get(ISeasonPassesDbService);
        redisService = module.get(RedisService);

        module.useLogger(false);

        passesDb.findById.mockResolvedValue(passFixture());
        usecaseDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
        usecaseDb.bulkCreate.mockResolvedValue(1);
    });

    it('creates sales with a fresh batchId', async () => {
        const result = await usecase.execute(userId, validDto);

        expect(result.salesCreated).toBe(1);
        expect(result.batchId).toEqual(expect.any(String));
        expect(usecaseDb.bulkCreate).toHaveBeenCalledTimes(1);
    });

    describe('when sales are created', () => {
        it('invalidates the accounting and recipients caches', async () => {
            await usecase.execute(userId, validDto);

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateAccounting(userId),
            );
            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        });
    });

    describe('when no sales are created', () => {
        it('does not invalidate any cache', async () => {
            usecaseDb.bulkCreate.mockResolvedValue(0);

            await usecase.execute(userId, validDto);

            expect(redisService.invalidatePattern).not.toHaveBeenCalled();
        });
    });

    it('passes a provided soldAt through to bulkCreate for SOLD rows', async () => {
        const withSoldAt: CommitRequestDto = {
            ...validDto,
            rows: [{ ...validDto.rows[0]!, soldAt: '2025-09-10' }],
        };

        await usecase.execute(userId, withSoldAt);

        expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                sales: [
                    expect.objectContaining({
                        soldAt: new Date('2025-09-10T12:00:00.000Z'),
                    }),
                ],
            }),
        );
    });

    describe('when the row is not SOLD', () => {
        it('nulls soldAt, even if provided', async () => {
            const pending: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, status: 'PENDING', soldAt: '2025-09-10' }],
            };

            await usecase.execute(userId, pending);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [expect.objectContaining({ soldAt: null })],
                }),
            );
        });

        it('sends no gift payload', async () => {
            const pending: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, status: 'PENDING', soldAt: '2025-09-10' }],
            };

            await usecase.execute(userId, pending);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [expect.objectContaining({ gift: null })],
                }),
            );
        });
    });

    describe('when the row is GIFTED', () => {
        it('sets gift.giftedAt to the provided date at noon UTC and gift.recipientName to the row recipient', async () => {
            const gifted: CommitRequestDto = {
                ...validDto,
                rows: [
                    {
                        ...validDto.rows[0]!,
                        status: 'GIFTED',
                        soldAt: '2025-09-10',
                        recipient: 'Marc',
                    },
                ],
            };

            await usecase.execute(userId, gifted);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [
                        expect.objectContaining({
                            gift: {
                                recipientName: 'Marc',
                                giftedAt: new Date('2025-09-10T12:00:00.000Z'),
                            },
                            soldAt: null,
                        }),
                    ],
                }),
            );
        });

        it('falls back to the match date when no date was provided', async () => {
            const gifted: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, status: 'GIFTED', recipient: 'Marc' }],
            };

            await usecase.execute(userId, gifted);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [
                        expect.objectContaining({
                            gift: expect.objectContaining({
                                giftedAt: matchFixture().date,
                            }),
                        }),
                    ],
                }),
            );
        });

        it('normalizes ragged whitespace in the recipient name', async () => {
            const gifted: CommitRequestDto = {
                ...validDto,
                rows: [
                    {
                        ...validDto.rows[0]!,
                        status: 'GIFTED',
                        recipient: '  Marc   Dupont ',
                    },
                ],
            };

            await usecase.execute(userId, gifted);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [
                        expect.objectContaining({
                            gift: expect.objectContaining({
                                recipientName: 'Marc Dupont',
                            }),
                        }),
                    ],
                }),
            );
        });
    });

    describe('when a row has an error', () => {
        it('throws IMPORT_ROWS_INVALID', async () => {
            const bad: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, allocations: [] }],
            };

            await expect(usecase.execute(userId, bad)).rejects.toMatchObject({
                code: ErrorCode.IMPORT_ROWS_INVALID,
            });
        });
    });

    it('re-resolves matchId server-side and rejects a tampered row', async () => {
        const tampered: CommitRequestDto = {
            ...validDto,
            rows: [{ ...validDto.rows[0]!, date: '2025-12-25' }],
        };

        await expect(usecase.execute(userId, tampered)).rejects.toMatchObject({
            code: ErrorCode.IMPORT_ROWS_INVALID,
        });
    });

    describe('when a row resolves by date but carries a foreign client-supplied matchId', () => {
        const foreignMatchId = '44444444-4444-4444-4444-444444444444';

        it('commits using the server-resolved matchId, not the client-supplied one', async () => {
            const tampered: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, matchId: foreignMatchId }],
            };

            await usecase.execute(userId, tampered);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [expect.objectContaining({ matchId })],
                }),
            );
            expect(usecaseDb.bulkCreate).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [expect.objectContaining({ matchId: foreignMatchId })],
                }),
            );
        });
    });

    describe('when pass validation fails', () => {
        it('propagates SEASON_PASS_FORBIDDEN from the shared validator', async () => {
            passesDb.findById.mockResolvedValue(
                passFixture({ userId: 'other-user' as UserId }),
            );

            await expect(usecase.execute(userId, validDto)).rejects.toMatchObject({
                code: ErrorCode.SEASON_PASS_FORBIDDEN,
            });
            expect(usecaseDb.bulkCreate).not.toHaveBeenCalled();
        });
    });
});
```

- [ ] **Step 6: Run the usecase spec to verify it fails**

Run: `npx vitest run src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.spec.ts`
Expected: FAIL — `Failed to resolve import "./commit-sales-import.usecase"`.

- [ ] **Step 7: Implement the usecase**

Create `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.ts`:

```ts
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';

import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice } from '@psg/shared/money';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import type { BulkSaleGiftInput } from '../../../../db/sales-import/sales-import.db.interface';
import { normalizeRecipientName } from '../../../../shared/utils/recipient-name.util';
import { computeProfit } from '../../../sales/shared/profit.util';
import { CommitRequestDto } from '../../dto/commit-request.dto';
import { DraftRowDto } from '../../dto/draft-row.dto';
import { validateCommitRows } from '../../sales-import.resolver';
import { dateOnlyToUtcNoon } from '../../utils/date-only.util';
import { ImportCacheInvalidator } from '../../shared/import-cache.invalidator';
import { ImportPassesValidator } from '../../shared/import-passes.validator';
import { ICommitSalesImportUsecaseDb } from './commit-sales-import.usecase.db';

export type CommitResult = {
    batchId: string;
    salesCreated: number;
};

export abstract class ICommitSalesImportUsecase {
    abstract execute(userId: UserId, dto: CommitRequestDto): Promise<CommitResult>;
}

// The commit half of the CSV sales import (spec 2026-06-20): validate the
// selection, re-resolve every row server-side, then write the whole batch
// under one fresh batchId. Extracted from SalesImportService.commit
// (PSG-26); the pipeline below is byte-identical to what that method ran.
@Injectable()
export class CommitSalesImportUsecase implements ICommitSalesImportUsecase {
    constructor(
        private readonly db: ICommitSalesImportUsecaseDb,
        private readonly passesValidator: ImportPassesValidator,
        private readonly cacheInvalidator: ImportCacheInvalidator,
    ) {}

    async execute(userId: UserId, dto: CommitRequestDto): Promise<CommitResult> {
        const seasonStartYear = await this.passesValidator.validate(
            userId,
            dto.selectedPassIds,
        );
        const homeMatches = await this.db.getHomeMatchesForSeason(seasonStartYear);
        const validated = validateCommitRows({
            rows: dto.rows,
            homeMatches,
            selectedPassIds: dto.selectedPassIds,
        });

        if (validated.summary.errors > 0) {
            throw new DomainException(ErrorCode.IMPORT_ROWS_INVALID);
        }

        const matchDates = new Map(homeMatches.map((match) => [match.id, match.date]));

        const batchId = randomUUID();
        const sales = validated.rows.map((row) => ({
            matchId: row.matchId! as MatchId,
            listedPrice: row.listedPrice as ListedPrice,
            invest: row.invest as Invest,
            profit: computeProfit(row.listedPrice as ListedPrice),
            nbTickets: row.nbTickets as TicketCount,
            status: row.status,
            soldAt:
                row.status === 'SOLD' && row.soldAt != null
                    ? dateOnlyToUtcNoon(row.soldAt)
                    : null,
            gift: this.buildGiftInput(row, matchDates),
            allocations: row.allocations.map((allocation) => ({
                seasonPassId: allocation.seasonPassId as SeasonPassId,
                nbTickets: allocation.nbTickets as TicketCount,
            })),
        }));

        const salesCreated = await this.db.bulkCreate({
            userId,
            batchId,
            sales,
        });

        if (salesCreated > 0) {
            await this.cacheInvalidator.afterWrite(userId);
        }

        return { batchId, salesCreated };
    }

    // Non-null exactly for a GIFTED row. A row that carries its own date uses
    // it, pinned to noon UTC exactly like soldAt; a row without one falls back
    // to the match's real stored date rather than the same day at noon —
    // "given away, date unknown" is not representable, and the match is the
    // date the gift was for (spec D10). validateCommitRows has already guaranteed both a
    // recipient and a resolvable match for every GIFTED row that reaches
    // here (a row without either is error:gift-recipient-missing or
    // error:match-missing and never commits), so the throw below is a
    // fail-loud backstop, not a path the app can reach.
    private buildGiftInput(
        row: DraftRowDto,
        matchDates: Map<string, Date>,
    ): BulkSaleGiftInput | null {
        if (row.status !== 'GIFTED') {
            return null;
        }

        const recipientName = normalizeRecipientName(row.recipient ?? '');
        const giftedAt =
            row.soldAt != null
                ? dateOnlyToUtcNoon(row.soldAt)
                : matchDates.get(row.matchId!);

        if (recipientName.length === 0 || giftedAt == null) {
            throw new DomainException(ErrorCode.IMPORT_ROWS_INVALID);
        }

        return { recipientName, giftedAt };
    }
}
```

- [ ] **Step 8: Run both usecase specs to verify they pass**

Run: `npx vitest run src/api/sales-import/usecases/commit-sales-import/`
Expected: PASS — usecase spec 13 tests (the 12 ported + 1 new forbidden-propagation), db spec 3 tests.

- [ ] **Step 9: Rewrite `sales-import.service.ts` to its final state**

The complete file — `commit` is now a delegate, `buildGiftInput` and the sales-mapping code are gone, and `CommitResult` is re-exported for the controller:

```ts
import { Injectable } from '@nestjs/common';

import type { UserId } from '@psg/shared/ids';

import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { ISalesImportDbService } from '../../db/sales-import/sales-import.db.interface';
import { CommitRequestDto } from './dto/commit-request.dto';
import { PreviewResponse } from './dto/preview-response.dto';
import { parseImportCsv } from './sales-import.csv';
import { resolveDraftRows } from './sales-import.resolver';
import {
    CommitResult,
    ICommitSalesImportUsecase,
} from './usecases/commit-sales-import/commit-sales-import.usecase';
import { ImportCacheInvalidator } from './shared/import-cache.invalidator';
import { ImportPassesValidator } from './shared/import-passes.validator';

export type { CommitResult };

@Injectable()
export class SalesImportService {
    constructor(
        private readonly matchesDb: IMatchesDbService,
        private readonly salesImportDb: ISalesImportDbService,
        private readonly passesValidator: ImportPassesValidator,
        private readonly cacheInvalidator: ImportCacheInvalidator,
        private readonly commitSalesImportUsecase: ICommitSalesImportUsecase,
    ) {}

    async preview(
        userId: UserId,
        buffer: Buffer,
        selectedPassIds: string[],
    ): Promise<PreviewResponse> {
        const parsed = parseImportCsv(buffer);

        if (parsed.kind === 'error') {
            throw new DomainException(ErrorCode.IMPORT_CSV_INVALID);
        }

        const seasonStartYear = await this.passesValidator.validate(
            userId,
            selectedPassIds,
        );
        const homeMatches = await this.matchesDb.getHomeMatchesForSeason(seasonStartYear);
        const resolved = resolveDraftRows({
            rawRows: parsed.rows,
            homeMatches,
            selectedPassIds,
        });

        return {
            rows: resolved.rows,
            summary: resolved.summary,
            missingMatches: resolved.missingMatches,
            seasonStartYear,
        };
    }

    async commit(userId: UserId, dto: CommitRequestDto): Promise<CommitResult> {
        return this.commitSalesImportUsecase.execute(userId, dto);
    }

    async revert(userId: UserId, batchId: string): Promise<{ deleted: number }> {
        const deleted = await this.salesImportDb.deleteBatch(userId, batchId);

        if (deleted > 0) {
            await this.cacheInvalidator.afterWrite(userId);
        }

        return { deleted };
    }
}
```

Imports removed in this rewrite (verify by diff): `randomUUID`, all `@psg/shared` types except `UserId`, `BulkSaleGiftInput`, `normalizeRecipientName`, `computeProfit`, `DraftRowDto`, `dateOnlyToUtcNoon`, `validateCommitRows`.

- [ ] **Step 10: Create the usecase module and wire it into `sales-import.module.ts`**

Create `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.module.ts` (one module per usecase, spec D1 — mirrors `update-sale.usecase.module.ts`):

```ts
import { Module } from '@nestjs/common';

import { MatchesDbModule } from '../../../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../../../db/season-passes/season-passes.db.module';
import { SalesImportDbModule } from '../../../../db/sales-import/sales-import.db.module';
import { RedisModule } from '../../../../redis/redis.module';
import { ImportCacheInvalidator } from '../../shared/import-cache.invalidator';
import { ImportPassesValidator } from '../../shared/import-passes.validator';
import {
    CommitSalesImportUsecase,
    ICommitSalesImportUsecase,
} from './commit-sales-import.usecase';
import {
    CommitSalesImportUsecaseDb,
    ICommitSalesImportUsecaseDb,
} from './commit-sales-import.usecase.db';

@Module({
    imports: [MatchesDbModule, SeasonPassesDbModule, RedisModule, SalesImportDbModule],
    providers: [
        { provide: ICommitSalesImportUsecaseDb, useClass: CommitSalesImportUsecaseDb },
        { provide: ICommitSalesImportUsecase, useClass: CommitSalesImportUsecase },
        ImportPassesValidator,
        ImportCacheInvalidator,
    ],
    exports: [ICommitSalesImportUsecase],
})
export class CommitSalesImportUsecaseModule {}
```

No `PrismaModule` — the usecase db wraps existing db tokens and never talks to Prisma (spec D4). The four imported modules are the usecase graph's actual deps (matches + sales-import db for the usecase db; season-passes + redis for the shared collaborators, provided here exactly as `UpdateSaleUsecaseModule` provides `SaleAllocationsValidator`/`SalesCacheInvalidator`). Only `ICommitSalesImportUsecase` is exported, matching the sales usecase modules.

Then `sales-import.module.ts` — `imports` gains `CommitSalesImportUsecaseModule` (the four existing entries stay: `preview`/`revert` still run in the service); `providers` gains the two shared collaborators from Tasks 1–2 but **not** the usecase pair:

```ts
import { Module } from '@nestjs/common';

import { MatchesDbModule } from '../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { SalesImportDbModule } from '../../db/sales-import/sales-import.db.module';
import { RedisModule } from '../../redis/redis.module';
import { SalesImportController } from './sales-import.controller';
import { SalesImportService } from './sales-import.service';
import { ImportCacheInvalidator } from './shared/import-cache.invalidator';
import { ImportPassesValidator } from './shared/import-passes.validator';
import { CommitSalesImportUsecaseModule } from './usecases/commit-sales-import/commit-sales-import.usecase.module';

@Module({
    imports: [
        MatchesDbModule,
        SeasonPassesDbModule,
        RedisModule,
        SalesImportDbModule,
        CommitSalesImportUsecaseModule,
    ],
    controllers: [SalesImportController],
    providers: [SalesImportService, ImportPassesValidator, ImportCacheInvalidator],
})
export class SalesImportModule {}
```

- [ ] **Step 11: Update `sales-import.service.spec.ts`**

Three edits:

1. Add imports:
   ```ts
   import { ICommitSalesImportUsecase } from './usecases/commit-sales-import/commit-sales-import.usecase';
   ```
2. Declare and mock the token next to the other mocks:
   ```ts
   let commitUsecase: DeepMockProxy<ICommitSalesImportUsecase>;
   ```
   In `beforeEach`: `commitUsecase = mockDeep<ICommitSalesImportUsecase>();` and add the provider:
   ```ts
   { provide: ICommitSalesImportUsecase, useValue: commitUsecase },
   ```
   (the `SalesImportService`, `ImportPassesValidator`, `ImportCacheInvalidator` providers and the four dep mocks stay as they are after Tasks 1–2).
3. **Delete the entire `describe('commit', …)` block — all 12 tests, the block that follows the `preview` block and precedes `revert`** — and replace it with a thin delegation test:

   ```ts
   describe('commit', () => {
       it('delegates to the commit usecase', async () => {
           const dto: CommitRequestDto = {
               selectedPassIds: [passAId],
               rows: [],
           };
           commitUsecase.execute.mockResolvedValue({ batchId: 'batch-1', salesCreated: 2 });

           const result = await service.commit(userId, dto);

           expect(commitUsecase.execute).toHaveBeenCalledWith(userId, dto);
           expect(result).toEqual({ batchId: 'batch-1', salesCreated: 2 });
       });
   });
   ```

   The `preview` and `revert` blocks (with `passFixture`, `matchFixture`, `passesDb`, `importDb`, `redisService`) stay untouched — `validDto` was only used by the old commit block and must be deleted with it. `CommitRequestDto` stays imported (the delegation test uses it).

- [ ] **Step 12: Run the full test suite**

Run: `npm test`
Expected: PASS — service spec (preview 4 + delegation 1 + revert 4), usecase folder 16, validator 4, invalidator 2, plus all untouched suites (`app.module.spec.ts` compiles the new providers).

- [ ] **Step 13: Verify no stray references and the ORM boundary**

```bash
grep -rn "assertPasses\|invalidateImportCaches" src/api/sales-import --include='*.ts'
# Expected: no output.

grep -rn "buildGiftInput" src/api/sales-import --include='*.ts'
# Expected: only src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.ts

grep -n "@prisma/client\|prisma.service" src/api/sales-import/usecases/commit-sales-import/*.ts
# Expected: no output (type-only imports of db interfaces are fine; no Prisma imports)

grep -rn "commit-sales-import" web scripts 2>/dev/null
# Expected: no output (backend-only)
```

- [ ] **Step 14: Run the full gate**

Run: `npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js && echo GATE_OK`
Expected: `GATE_OK`. Critically:
- `src/app.module.spec.ts` PASSES — catches a missing provider in Step 10.
- `lint:deps` reports no errors — no ORM edge escaped `src/db`/`*.db.ts`, no orphans (every new file is imported in this same change).
- The 12 migrated assertions pass against the usecase — the net-zero proof.

- [ ] **Step 15: Commit**

```bash
git add src/api/sales-import/usecases/commit-sales-import/ \
        src/api/sales-import/sales-import.service.ts \
        src/api/sales-import/sales-import.module.ts \
        src/api/sales-import/sales-import.service.spec.ts
git commit -m "refactor(sales-import): extract commit into its own usecase (PSG-26)"
```
