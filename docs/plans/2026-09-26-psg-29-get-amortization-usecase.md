# PSG-29: Extract `AccountingService.getAmortization` into `GetAmortizationUsecase` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `AccountingService.getAmortization` and its module-level `emptyAmortization` fallback into `src/api/accounting/usecases/get-amortization/`, split into `get-amortization.usecase.ts` (business logic, no ORM import) + `get-amortization.usecase.db.ts` (the only file in the usecase folder that imports the ORM, scoped to exactly the `findBySeason`/`getRealizedProfitPerMatch` queries it needs).

**Architecture:** Same three-file usecase shape PSG-28 (`get-season-accounting`) established: `<name>.usecase.ts` (interface token + class), `<name>.usecase.db.ts` (interface token + class wrapping existing db tokens — `ISeasonPassesDbService` + `IAccountingDbService`, no `ISalesDbService`), `<name>.usecase.module.ts` (colocated module registering both, exporting only the usecase token). `AccountingService.getAmortization` becomes a one-line delegate. Because `getAmortization` was the only user of `accountingDbService`, `seasonPassesDbService`, and `redisService` on `AccountingService` (confirmed: `getCurrentSeason`/`getGivenSeason`/`getAllTime` already delegate fully to `GetSeasonAccountingUsecase`, and `getAllTime` only touches `salesDbService`), all three become unused there and are removed from `AccountingService`'s constructor, and `accounting.module.ts` drops its now-unneeded direct imports of `AccountingDbModule`/`SeasonPassesDbModule`/`RedisModule`.

**Tech Stack:** NestJS 12 + Prisma 6 (`src/`), Vitest 5 + `vitest-mock-extended` (`npm test` = `vitest run`), `dependency-cruiser` for layering rules. No new dependencies — if a task seems to need one, stop and escalate.

**Spec:** `docs/specs/2026-09-26-psg-29-get-amortization-usecase-design.md`. Read it before Task 1, especially the section on `AccountingService`'s constructor losing three now-unused dependencies.

## Global Constraints

- **Pure refactor. No behavior change.** Same cache key (`CACHE_KEYS.amortization`), same TTL (`ONE_DAY_TTL`), same progress/remaining/surplus/break-even formulas, same `emptyAmortization` fallback shape.
- **`get-amortization.usecase.ts` must not import `@prisma/client`, `PrismaService`, or any runtime member of `src/db/**`** (type-only imports are fine).
- **`get-amortization.usecase.db.ts` is the only file in the usecase folder that imports the ORM** — indirectly, by depending on the existing `ISeasonPassesDbService`/`IAccountingDbService` tokens. It never imports `@prisma/client` or `PrismaService` directly, and exposes only `findBySeason` and `getRealizedProfitPerMatch`.
- **`GetSeasonAccountingUsecase` and its module/spec are out of scope** — do not touch their bodies, imports, or tests.
- **Files never edited in any task:** `src/api/accounting/accounting.controller.ts`, `src/api/accounting/dto/**`, `src/api/accounting/types/**` (only imported, not modified), `src/api/accounting/interfaces/accounting.service.interface.ts` (signature unchanged), `src/api/accounting/usecases/get-season-accounting/**`, `src/db/**`, `src/redis/redis.service.ts`, `web/**`, `.dependency-cruiser.cjs`, `tsconfig*.json`, `package.json`.
- Explicit return types on every function/method, including `Promise<void>`. Constructor-injected dependencies are `private readonly`. No single-letter locals (loop counters excepted). No inline `if` — always braced. Blank line before `if`/`for`/`while`/`return`/`throw` unless first in block.
- Vitest structure: a `describe` per condition, `it` titles state only the outcome.
- **Line numbers drift — re-read every file before editing it.** Refer to symbols, not line numbers.
- **Gate after every task, green before proceeding:** `npm run lint && npm run typecheck && npm test`. Task 3 adds `npm run lint:deps`, `npm run build`, `test -f dist/main.js`. **No task may end with a red suite.**
- Commit after each task (conventional-commits style, `commitlint` is active).

---

## Parallelism

**Backend only. No frontend work exists in this plan — `web/` is not touched by any task.** Tasks are sequential and build on each other's file contents: 1 (db wrapper) → 2 (usecase, depends on 1) → 3 (service wiring + module + verification, depends on 2). No independent backend/frontend split is possible or needed; run 1 → 2 → 3 in order.

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.ts` | `GetAmortizationUsecaseDb` + `IGetAmortizationUsecaseDb` — narrow wrapper over `ISeasonPassesDbService.findBySeason` + `IAccountingDbService.getRealizedProfitPerMatch` |
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.spec.ts` | Delegation tests for the wrapper |
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.ts` | `GetAmortizationUsecase` + `IGetAmortizationUsecase` — `execute`, module-level `emptyAmortization` |
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts` | Moved `getAmortization` tests, retargeted to `execute()` |
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.module.ts` | `GetAmortizationUsecaseModule` — registers both providers, exports the usecase token |

**Modified:**

| File | Change |
|---|---|
| `src/api/accounting/accounting.service.ts` | `getAmortization` becomes a one-line delegate; loses `emptyAmortization`; constructor drops `accountingDbService`, `seasonPassesDbService`, `redisService`; gains `IGetAmortizationUsecase` |
| `src/api/accounting/accounting.module.ts` | Imports `GetAmortizationUsecaseModule`; drops direct `AccountingDbModule`/`SeasonPassesDbModule`/`RedisModule` imports; keeps `SalesDbModule` and `GetSeasonAccountingUsecaseModule` |
| `src/api/accounting/accounting.service.spec.ts` | `getAmortization` describe shrinks to a delegation assertion against a mocked `IGetAmortizationUsecase`; test module drops `IAccountingDbService`/`ISeasonPassesDbService`/`RedisService` providers (no longer consumed) |

**Untouched:** the never-edited list in Global Constraints.

---

## Task 1 — Create `GetAmortizationUsecaseDb` + its spec

Standalone: no dependency on Task 2/3. This is the only file in the usecase folder that imports the ORM (indirectly, via the existing db tokens).

**Files:**
- Create: `src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.ts`
- Create: `src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.spec.ts`

**Interfaces:**
- Consumes (exist, unchanged): `ISeasonPassesDbService.findBySeason(userId, seasonStartYear)` (`src/db/season-passes/season-passes.db.interface.ts`); `IAccountingDbService.getRealizedProfitPerMatch(userId, from, to)` (`src/db/accounting/accounting.db.interface.ts`).
- Produces (Task 2 relies on these exact names): abstract class `IGetAmortizationUsecaseDb` with `findBySeason(userId, seasonStartYear)` and `getRealizedProfitPerMatch(userId, from, to)`; class `GetAmortizationUsecaseDb`.

- [ ] **Step 1: Write the failing spec**

Create `src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { GetAmortizationUsecaseDb } from './get-amortization.usecase.db';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import { IAccountingDbService } from '../../../../db/accounting/accounting.db.interface';
import type { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';
import type { MatchRealizedProfit } from '../../../../db/accounting/types/match-realized-profit.type';

describe('GetAmortizationUsecaseDb', () => {
    let usecaseDb: GetAmortizationUsecaseDb;
    let seasonPassesDb: DeepMockProxy<ISeasonPassesDbService>;
    let accountingDb: DeepMockProxy<IAccountingDbService>;

    const userId = 'user-uuid' as UserId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                GetAmortizationUsecaseDb,
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<ISeasonPassesDbService>(),
                },
                {
                    provide: IAccountingDbService,
                    useValue: mockDeep<IAccountingDbService>(),
                },
            ],
        }).compile();

        usecaseDb = module.get(GetAmortizationUsecaseDb);
        seasonPassesDb = module.get(ISeasonPassesDbService);
        accountingDb = module.get(IAccountingDbService);

        module.useLogger(false);
    });

    describe('findBySeason', () => {
        it('delegates to ISeasonPassesDbService with the same arguments', async () => {
            const passes = [{ id: 'pass-1' }] as SeasonPass[];
            seasonPassesDb.findBySeason.mockResolvedValueOnce(passes);

            const result = await usecaseDb.findBySeason(userId, 2024 as SeasonYear);

            expect(seasonPassesDb.findBySeason).toHaveBeenCalledWith(userId, 2024);
            expect(result).toBe(passes);
        });
    });

    describe('getRealizedProfitPerMatch', () => {
        it('delegates to IAccountingDbService with the same arguments', async () => {
            const rows = [{ matchId: 'm1' }] as MatchRealizedProfit[];
            accountingDb.getRealizedProfitPerMatch.mockResolvedValueOnce(rows);

            const from = new Date('2024-08-01');
            const to = new Date('2025-07-31');
            const result = await usecaseDb.getRealizedProfitPerMatch(userId, from, to);

            expect(accountingDb.getRealizedProfitPerMatch).toHaveBeenCalledWith(
                userId,
                from,
                to,
            );
            expect(result).toBe(rows);
        });
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.spec.ts`
Expected: FAIL — `get-amortization.usecase.db.ts` does not exist yet.

- [ ] **Step 3: Create `get-amortization.usecase.db.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';
import { IAccountingDbService } from '../../../../db/accounting/accounting.db.interface';
import { MatchRealizedProfit } from '../../../../db/accounting/types/match-realized-profit.type';

// This usecase's entire db surface (PSG-29): exactly the season-passes/
// accounting queries getAmortization runs. It wraps the existing db tokens
// and never talks to Prisma directly — SeasonPassesDb/AccountingDb stay the
// single implementations of these queries, nothing is duplicated here.
export abstract class IGetAmortizationUsecaseDb {
    abstract findBySeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<SeasonPass[]>;
    abstract getRealizedProfitPerMatch(
        userId: UserId,
        from: Date,
        to: Date,
    ): Promise<MatchRealizedProfit[]>;
}

@Injectable()
export class GetAmortizationUsecaseDb implements IGetAmortizationUsecaseDb {
    constructor(
        private readonly seasonPassesDb: ISeasonPassesDbService,
        private readonly accountingDb: IAccountingDbService,
    ) {}

    findBySeason(userId: UserId, seasonStartYear: SeasonYear): Promise<SeasonPass[]> {
        return this.seasonPassesDb.findBySeason(userId, seasonStartYear);
    }

    getRealizedProfitPerMatch(
        userId: UserId,
        from: Date,
        to: Date,
    ): Promise<MatchRealizedProfit[]> {
        return this.accountingDb.getRealizedProfitPerMatch(userId, from, to);
    }
}
```

- [ ] **Step 4: Run the spec again**

Run: `npx vitest run src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: green. (This file is not wired into any module yet, so it's dead code the compiler and tests can still see — that's expected at this point.)

- [ ] **Step 6: Commit**

```bash
git add src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.ts src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.spec.ts
git commit -m "feat(accounting): add GetAmortizationUsecaseDb (PSG-29)"
```

**Done when:** the db wrapper's 2 tests pass and the full gate is green.

---

## Task 2 — Create `GetAmortizationUsecase` + module, with its own tests

Depends on Task 1's `IGetAmortizationUsecaseDb`. Not yet wired into `AccountingService` — that's Task 3.

**Files:**
- Create: `src/api/accounting/usecases/get-amortization/get-amortization.usecase.ts`
- Create: `src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts`
- Create: `src/api/accounting/usecases/get-amortization/get-amortization.usecase.module.ts`

**Interfaces:**
- Consumes: `IGetAmortizationUsecaseDb` from Task 1 (`findBySeason`, `getRealizedProfitPerMatch`); `RedisService.get(key, ttl, loader)` (`src/redis/redis.service.ts`); `CACHE_KEYS.amortization` (`src/redis/CACHE_KEYS.ts`); `ONE_DAY_TTL` (`src/shared/constants.ts`); `getSeasonWindow` (`src/shared/utils/season.utils.ts`); `Amortization`/`AmortizationMatchRow` (`src/api/accounting/types/amortization.type.ts`); `AccountingDbModule`, `SeasonPassesDbModule`, `RedisModule`.
- Produces (Task 3 relies on these exact names): abstract class `IGetAmortizationUsecase` with `execute(userId: UserId, seasonStartYear: SeasonYear): Promise<Amortization>`; class `GetAmortizationUsecase`; module class `GetAmortizationUsecaseModule`.

- [ ] **Step 1: Write the failing spec**

Create `src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { GetAmortizationUsecase } from './get-amortization.usecase';
import { IGetAmortizationUsecaseDb } from './get-amortization.usecase.db';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import type { MatchRealizedProfit } from '../../../../db/accounting/types/match-realized-profit.type';
import type { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';

describe('GetAmortizationUsecase', () => {
    let usecase: GetAmortizationUsecase;
    let db: DeepMockProxy<IGetAmortizationUsecaseDb>;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'userUuid' as UserId;
    const seasonStartYear = 2024 as SeasonYear;

    function row(
        overrides: Partial<MatchRealizedProfit> & {
            matchId: MatchId;
            date: Date;
            matchProfit: number;
        },
    ): MatchRealizedProfit {
        return {
            opponent: 'Marseille',
            competition: 'CHAMPIONSHIP',
            atHome: true,
            ...overrides,
        };
    }

    function pass(price: number): SeasonPass {
        return {
            id: 'pass-id' as SeasonPassId,
            userId,
            seasonStartYear,
            price,
            label: 'Pass',
            category: '-',
            row: '-',
            seat: '-',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                GetAmortizationUsecase,
                {
                    provide: IGetAmortizationUsecaseDb,
                    useValue: mockDeep<IGetAmortizationUsecaseDb>(),
                },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usecase = module.get(GetAmortizationUsecase);
        db = module.get(IGetAmortizationUsecaseDb);
        redisService = module.get(RedisService);

        module.useLogger(false);

        // RedisService.get follows a cache-aside contract: runs the loader
        // on a miss and returns its value. Default to "always miss" so
        // tests exercise the underlying logic unless they opt into a hit.
        redisService.get.mockImplementation(
            async <T>(_key: unknown, _ttl: number, loader: () => Promise<T | null>) =>
                loader(),
        );
    });

    describe('execute', () => {
        it('returns zeroed result when no sales and no pass', async () => {
            db.findBySeason.mockResolvedValueOnce([]);
            db.getRealizedProfitPerMatch.mockResolvedValueOnce([]);

            const result = await usecase.execute(userId, seasonStartYear);

            expect(result.passPrice).toBe(0);
            expect(result.hasPass).toBe(false);
            expect(result.totalRealized).toBe(0);
            expect(result.progress).toBe(0);
            expect(result.remaining).toBe(0);
            expect(result.surplus).toBe(0);
            expect(result.breakEven).toBeNull();
            expect(result.perMatch).toEqual([]);
        });

        it('reports progress without break-even when below pass price', async () => {
            db.findBySeason.mockResolvedValueOnce([pass(1000)]);
            db.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 200,
                }),
            ]);

            const result = await usecase.execute(userId, seasonStartYear);

            expect(result.hasPass).toBe(true);
            expect(result.passPrice).toBe(1000);
            expect(result.totalRealized).toBe(200);
            expect(result.progress).toBe(0.2);
            expect(result.remaining).toBe(800);
            expect(result.surplus).toBe(0);
            expect(result.breakEven).toBeNull();
        });

        it('flags the first match whose cumulative crosses pass price', async () => {
            db.findBySeason.mockResolvedValueOnce([pass(300)]);
            db.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 200,
                }),
                row({
                    matchId: 'm2' as MatchId,
                    date: new Date('2024-09-15'),
                    matchProfit: 150,
                }),
                row({
                    matchId: 'm3' as MatchId,
                    date: new Date('2024-09-29'),
                    matchProfit: 50,
                }),
            ]);

            const result = await usecase.execute(userId, seasonStartYear);

            expect(result.totalRealized).toBe(400);
            expect(result.progress).toBe(1);
            expect(result.remaining).toBe(0);
            expect(result.surplus).toBe(100);
            expect(result.breakEven).toMatchObject({ matchId: 'm2' });
            expect(result.perMatch[0]?.isBreakEven).toBe(false);
            expect(result.perMatch[1]?.isBreakEven).toBe(true);
            expect(result.perMatch[2]?.isBreakEven).toBe(false);
        });

        it('caps progress at 1 and reports surplus on overshoot', async () => {
            db.findBySeason.mockResolvedValueOnce([pass(100)]);
            db.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 500,
                }),
            ]);

            const result = await usecase.execute(userId, seasonStartYear);

            expect(result.progress).toBe(1);
            expect(result.surplus).toBe(400);
        });

        it('treats missing pass as no progress; surplus tracks total realized', async () => {
            db.findBySeason.mockResolvedValueOnce([]);
            db.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 300,
                }),
            ]);

            const result = await usecase.execute(userId, seasonStartYear);

            expect(result.hasPass).toBe(false);
            expect(result.progress).toBe(0);
            expect(result.remaining).toBe(0);
            expect(result.surplus).toBe(300);
        });

        it('reads from cache when present', async () => {
            const cachedValue = {
                seasonStartYear,
                passPrice: 1000,
                hasPass: true,
                totalRealized: 1000,
                progress: 1,
                remaining: 0,
                surplus: 0,
                breakEven: null,
                perMatch: [],
                passes: [],
            };
            redisService.get.mockReset();
            redisService.get.mockResolvedValueOnce(cachedValue);

            const result = await usecase.execute(userId, seasonStartYear);

            expect(result).toEqual(cachedValue);
            expect(db.getRealizedProfitPerMatch).not.toHaveBeenCalled();
            expect(db.findBySeason).not.toHaveBeenCalled();
        });

        it('delegates caching to redis with the right key and ttl', async () => {
            db.findBySeason.mockResolvedValueOnce([pass(100)]);
            db.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 100,
                }),
            ]);

            const result = await usecase.execute(userId, seasonStartYear);

            expect(redisService.get).toHaveBeenCalledTimes(1);
            expect(redisService.get).toHaveBeenCalledWith(
                CACHE_KEYS.amortization(userId, seasonStartYear),
                24 * 60 * 60,
                expect.any(Function),
            );
            expect(result.progress).toBe(1);
        });

        it('falls back to emptyAmortization when redis returns nullish', async () => {
            db.findBySeason.mockResolvedValueOnce([]);
            db.getRealizedProfitPerMatch.mockResolvedValueOnce([]);
            redisService.get.mockResolvedValueOnce(null);

            const result = await usecase.execute(userId, seasonStartYear);

            expect(result).toEqual({
                seasonStartYear,
                passPrice: 0,
                hasPass: false,
                totalRealized: 0,
                progress: 0,
                remaining: 0,
                surplus: 0,
                breakEven: null,
                perMatch: [],
                passes: [],
            });
        });
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts`
Expected: FAIL — `get-amortization.usecase.ts` does not exist yet.

- [ ] **Step 3: Create `get-amortization.usecase.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { getSeasonWindow } from '../../../../shared/utils/season.utils';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { ONE_DAY_TTL } from '../../../../shared/constants';
import { Amortization, AmortizationMatchRow } from '../../types/amortization.type';
import { IGetAmortizationUsecaseDb } from './get-amortization.usecase.db';

export abstract class IGetAmortizationUsecase {
    abstract execute(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<Amortization>;
}

// The amortization half of the accounting module (PSG-29): reads season-pass
// price and per-match realized profit for a season, computes cumulative
// profit, break-even detection, and progress/remaining/surplus; redis-cached.
// Extracted from AccountingService.getAmortization — byte-identical logic.
@Injectable()
export class GetAmortizationUsecase implements IGetAmortizationUsecase {
    constructor(
        private readonly db: IGetAmortizationUsecaseDb,
        private readonly redisService: RedisService,
    ) {}

    async execute(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<Amortization> {
        const result = await this.redisService.get(
            CACHE_KEYS.amortization(userId, seasonStartYear),
            ONE_DAY_TTL,
            async () => {
                const dates = getSeasonWindow(seasonStartYear, 'inclusive');

                const [passes, matchRows] = await Promise.all([
                    this.db.findBySeason(userId, seasonStartYear),
                    this.db.getRealizedProfitPerMatch(
                        userId,
                        dates.start,
                        dates.end,
                    ),
                ]);

                const hasPass = passes.length > 0;
                const passPrice = passes.reduce((sum, pass) => sum + pass.price, 0);
                const passSummaries = passes.map((pass) => ({
                    id: pass.id,
                    label: pass.label,
                    price: pass.price,
                }));

                let cumulative = 0;
                let breakEvenAssigned = false;

                const perMatch: AmortizationMatchRow[] = matchRows.map((row) => {
                    cumulative += row.matchProfit;

                    const isBreakEven =
                        !breakEvenAssigned &&
                        hasPass &&
                        passPrice > 0 &&
                        cumulative >= passPrice;

                    if (isBreakEven) {
                        breakEvenAssigned = true;
                    }

                    return {
                        matchId: row.matchId,
                        date: row.date,
                        opponent: row.opponent,
                        competition: row.competition,
                        atHome: row.atHome,
                        matchProfit: row.matchProfit,
                        cumulative,
                        isBreakEven,
                    };
                });

                const totalRealized = cumulative;
                const breakEvenRow = perMatch.find((row) => row.isBreakEven) ?? null;

                const amortization: Amortization = {
                    seasonStartYear,
                    passPrice,
                    hasPass,
                    totalRealized,
                    progress:
                        hasPass && passPrice > 0
                            ? Math.min(1, totalRealized / passPrice)
                            : 0,
                    remaining:
                        hasPass && passPrice > 0
                            ? Math.max(0, passPrice - totalRealized)
                            : 0,
                    surplus:
                        hasPass && passPrice > 0
                            ? Math.max(0, totalRealized - passPrice)
                            : Math.max(0, totalRealized),
                    breakEven: breakEvenRow
                        ? {
                              matchId: breakEvenRow.matchId,
                              date: breakEvenRow.date,
                              opponent: breakEvenRow.opponent,
                              cumulative: breakEvenRow.cumulative,
                          }
                        : null,
                    perMatch,
                    passes: passSummaries,
                };

                return amortization;
            },
        );

        return result ?? emptyAmortization(seasonStartYear);
    }
}

function emptyAmortization(seasonStartYear: number): Amortization {
    return {
        seasonStartYear,
        passPrice: 0,
        hasPass: false,
        totalRealized: 0,
        progress: 0,
        remaining: 0,
        surplus: 0,
        breakEven: null,
        perMatch: [],
        passes: [],
    };
}
```

**Diff this against the current `accounting.service.ts` `getAmortization`/`emptyAmortization` bodies comment-for-comment** — no logic or comment should be lost in the move.

- [ ] **Step 4: Run the spec again**

Run: `npx vitest run src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Create `get-amortization.usecase.module.ts`**

```ts
import { Module } from '@nestjs/common';

import { AccountingDbModule } from '../../../../db/accounting/accounting.db.module';
import { SeasonPassesDbModule } from '../../../../db/season-passes/season-passes.db.module';
import { RedisModule } from '../../../../redis/redis.module';
import {
    GetAmortizationUsecase,
    IGetAmortizationUsecase,
} from './get-amortization.usecase';
import {
    GetAmortizationUsecaseDb,
    IGetAmortizationUsecaseDb,
} from './get-amortization.usecase.db';

@Module({
    imports: [AccountingDbModule, SeasonPassesDbModule, RedisModule],
    providers: [
        {
            provide: IGetAmortizationUsecaseDb,
            useClass: GetAmortizationUsecaseDb,
        },
        { provide: IGetAmortizationUsecase, useClass: GetAmortizationUsecase },
    ],
    exports: [IGetAmortizationUsecase],
})
export class GetAmortizationUsecaseModule {}
```

`RedisModule` is mandatory — it is not `@Global()` (deglobalized 2026-09-18).

- [ ] **Step 6: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: green. `accounting.service.ts` is untouched so far — this task only adds new, currently-unwired files.

- [ ] **Step 7: Commit**

```bash
git add src/api/accounting/usecases/get-amortization/get-amortization.usecase.ts src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts src/api/accounting/usecases/get-amortization/get-amortization.usecase.module.ts
git commit -m "feat(accounting): add GetAmortizationUsecase (PSG-29)"
```

**Done when:** the usecase's 8 tests pass and the full gate is green, with `accounting.service.ts` still untouched.

---

## Task 3 — Wire `AccountingService` to delegate; drop now-unused dependencies; final verification

Depends on Task 2. This is the task that changes runtime wiring.

**Files:**
- Modify: `src/api/accounting/accounting.service.ts`
- Modify: `src/api/accounting/accounting.module.ts`
- Modify: `src/api/accounting/accounting.service.spec.ts`

**Interfaces:**
- Consumes: `IGetAmortizationUsecase` + `GetAmortizationUsecaseModule` from Task 2 (exact names, `execute(userId, seasonStartYear)`).

- [ ] **Step 1: Rewrite `accounting.service.ts` as the thin delegate**

Read the current file first (`src/api/accounting/accounting.service.ts`). Replace its full contents with:

```ts
import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import {
    getCurrentSeasonDate,
    getSeasonWindow,
    seasonStartYearFromDate,
} from '../../shared/utils/season.utils';
import { IAccountingService } from './interfaces/accounting.service.interface';
import { Amortization } from './types/amortization.type';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import { IGetSeasonAccountingUsecase } from './usecases/get-season-accounting/get-season-accounting.usecase';
import { IGetAmortizationUsecase } from './usecases/get-amortization/get-amortization.usecase';

@Injectable()
export class AccountingService implements IAccountingService {
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly getSeasonAccountingUsecase: IGetSeasonAccountingUsecase,
        private readonly getAmortizationUsecase: IGetAmortizationUsecase,
    ) {}

    async getCurrentSeason(userId: UserId): Promise<TimePeriodAccounting> {
        const seasonDate = getCurrentSeasonDate();
        const year = seasonStartYearFromDate(seasonDate.start);

        return this.getSeasonAccountingUsecase.execute(userId, seasonDate, year);
    }

    async getGivenSeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<TimePeriodAccounting> {
        const dates = getSeasonWindow(seasonStartYear, 'inclusive');

        return this.getSeasonAccountingUsecase.execute(userId, dates, seasonStartYear);
    }

    async getAllTime(userId: UserId): Promise<TimePeriodAccounting> {
        const oldestMatchSale = await this.salesDbService.getOldestMatchSale(userId);

        return this.getSeasonAccountingUsecase.execute(
            userId,
            {
                start: oldestMatchSale.Match.date,
            },
            null,
        );
    }

    async getAmortization(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<Amortization> {
        return this.getAmortizationUsecase.execute(userId, seasonStartYear);
    }
}
```

Note `IAccountingDbService`, `ISeasonPassesDbService`, `RedisService`, `CACHE_KEYS`, `ONE_DAY_TTL`, and `AmortizationMatchRow` are all gone from this file's imports — they had no remaining caller here.

- [ ] **Step 2: Rewire `accounting.module.ts`**

Read the current file first (`src/api/accounting/accounting.module.ts`). Full target content:

```ts
import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { SalesDbModule } from '../../db/sales/sales.db.module';
import { IAccountingService } from './interfaces/accounting.service.interface';
import { GetSeasonAccountingUsecaseModule } from './usecases/get-season-accounting/get-season-accounting.usecase.module';
import { GetAmortizationUsecaseModule } from './usecases/get-amortization/get-amortization.usecase.module';

@Module({
    imports: [
        SalesDbModule,
        GetSeasonAccountingUsecaseModule,
        GetAmortizationUsecaseModule,
    ],
    controllers: [AccountingController],
    providers: [{ provide: IAccountingService, useClass: AccountingService }],
    exports: [IAccountingService],
})
export class AccountingModule {}
```

`AccountingDbModule`, `SeasonPassesDbModule`, and `RedisModule` are dropped from this module's own `imports` — `AccountingService` no longer uses those tokens directly; they're now imported by `GetSeasonAccountingUsecaseModule` and `GetAmortizationUsecaseModule` respectively, each scoped to its own usecase.

- [ ] **Step 3: Rewrite `accounting.service.spec.ts`**

Read the current file first (`src/api/accounting/accounting.service.spec.ts`). Full target content:

```ts
import { Test } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { SalesDb } from '../../db/sales/sales.db';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import { Amortization } from './types/amortization.type';
import { OldestMatchSale } from '../../db/sales/type/oldest-match-sale.type';
import { IGetSeasonAccountingUsecase } from './usecases/get-season-accounting/get-season-accounting.usecase';
import { IGetAmortizationUsecase } from './usecases/get-amortization/get-amortization.usecase';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

// Only getCurrentSeasonDate needs mocking (to control "now") — seasonStartYearFromDate
// and getSeasonWindow must stay real so getGivenSeason/getCurrentSeason assertions
// exercise the actual UTC boundary math.
const seasonUtilsRef = vi.hoisted(() => ({
    value: null as null | typeof import('../../shared/utils/season.utils'),
}));

vi.mock('../../shared/utils/season.utils', async (importOriginal) => {
    seasonUtilsRef.value = await importOriginal();
    return {
        ...seasonUtilsRef.value,
        getCurrentSeasonDate: vi.fn(),
    };
});
const getCurrentSeasonDateMocked = vi.mocked(getCurrentSeasonDate);

describe('AccountingService', () => {
    let service: AccountingService;
    let salesDbService: DeepMockProxy<SalesDb>;
    let getSeasonAccountingUsecase: DeepMockProxy<IGetSeasonAccountingUsecase>;
    let getAmortizationUsecase: DeepMockProxy<IGetAmortizationUsecase>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                AccountingService,
                {
                    provide: ISalesDbService,
                    useValue: mockDeep<SalesDb>(),
                },
                {
                    provide: IGetSeasonAccountingUsecase,
                    useValue: mockDeep<IGetSeasonAccountingUsecase>(),
                },
                {
                    provide: IGetAmortizationUsecase,
                    useValue: mockDeep<IGetAmortizationUsecase>(),
                },
            ],
        }).compile();

        service = module.get(AccountingService);
        salesDbService = module.get(ISalesDbService);
        getSeasonAccountingUsecase = module.get(IGetSeasonAccountingUsecase);
        getAmortizationUsecase = module.get(IGetAmortizationUsecase);

        module.useLogger(false);
    });

    describe('getCurrentSeason', () => {
        it('should get the current season', async () => {
            const expectedResult: TimePeriodAccounting = {
                realized: null,
                unrealized: null,
                pending: null,
                gifted: null,
                seasonInvestments: [],
                totalSeasonInvestment: 0,
                leadTime: null,
            };

            // start month=0 < 7 → seasonStartYear = 2021
            const startDate = new Date(2022, 0, 1);
            const endDate = new Date(2022, 1, 2);
            getCurrentSeasonDateMocked.mockReturnValueOnce({
                start: startDate,
                end: endDate,
            });

            getSeasonAccountingUsecase.execute.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid' as UserId;

            await expect(service.getCurrentSeason(userId)).resolves.toEqual(
                expectedResult,
            );
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledTimes(1);
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledWith(
                userId,
                { start: startDate, end: endDate },
                2021,
            );
        });
    });

    describe('getGivenSeason', () => {
        it('should get the given season', async () => {
            const expectedResult: TimePeriodAccounting = {
                realized: null,
                unrealized: null,
                pending: null,
                gifted: null,
                seasonInvestments: [],
                totalSeasonInvestment: 0,
                leadTime: null,
            };

            getSeasonAccountingUsecase.execute.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid' as UserId;
            const seasonStartYear = 2022 as SeasonYear;

            await expect(
                service.getGivenSeason(userId, seasonStartYear),
            ).resolves.toEqual(expectedResult);
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledTimes(1);
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledWith(
                userId,
                {
                    start: new Date(Date.UTC(seasonStartYear, 7, 1)),
                    end: new Date(Date.UTC(seasonStartYear + 1, 6, 31)),
                },
                seasonStartYear,
            );
        });
    });

    describe('getAllTime', () => {
        it('should get the all time accounting', async () => {
            const expectedResult: TimePeriodAccounting = {
                realized: null,
                unrealized: null,
                pending: null,
                gifted: null,
                seasonInvestments: [],
                totalSeasonInvestment: 0,
                leadTime: null,
            };

            const oldestMatchSale = {
                Match: {
                    date: new Date('2022-02-02'),
                },
            } as OldestMatchSale;
            salesDbService.getOldestMatchSale.mockResolvedValueOnce(oldestMatchSale);

            getSeasonAccountingUsecase.execute.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid' as UserId;

            await expect(service.getAllTime(userId)).resolves.toEqual(expectedResult);
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledTimes(1);
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledWith(
                userId,
                { start: oldestMatchSale.Match.date },
                null,
            );
        });
    });

    describe('getAmortization', () => {
        it('delegates to IGetAmortizationUsecase with the same arguments', async () => {
            const expectedResult = {} as Amortization;
            const userId = 'userUuid' as UserId;
            const seasonStartYear = 2024 as SeasonYear;
            getAmortizationUsecase.execute.mockResolvedValueOnce(expectedResult);

            await expect(
                service.getAmortization(userId, seasonStartYear),
            ).resolves.toEqual(expectedResult);
            expect(getAmortizationUsecase.execute).toHaveBeenCalledTimes(1);
            expect(getAmortizationUsecase.execute).toHaveBeenCalledWith(
                userId,
                seasonStartYear,
            );
        });
    });
});
```

All 7 formula-level `getAmortization` cases (zeroed result, progress without break-even, break-even flagging, capped progress/surplus, missing-pass surplus, cache-hit read, cache key/ttl delegation) now live in `get-amortization.usecase.spec.ts` from Task 2 — this file only asserts `AccountingService` delegates.

- [ ] **Step 4: Run the accounting service spec**

Run: `npx vitest run src/api/accounting/accounting.service.spec.ts`
Expected: PASS, 4 tests (`getCurrentSeason`, `getGivenSeason`, `getAllTime`, `getAmortization`).

- [ ] **Step 5: Run the full verification gate**

```bash
npm run lint
npm run typecheck
npm run lint:deps
npm test
npm run build
test -f dist/main.js
```

Expected: everything green, `dist/main.js` exists.

- [ ] **Step 6: Confirm no stray callers of the old shape**

Run: `grep -rn "\.getAmortization(" src/`
Expected: only `src/api/accounting/accounting.service.ts` (the delegate) and `src/api/accounting/accounting.controller.ts` (the route handler).

- [ ] **Step 7: Commit**

```bash
git add src/api/accounting/accounting.service.ts src/api/accounting/accounting.module.ts src/api/accounting/accounting.service.spec.ts
git commit -m "refactor(accounting): delegate getAmortization to GetAmortizationUsecase (PSG-29)"
```

**Done when:** the full verification gate is green, `accounting.service.spec.ts` has exactly 4 tests, and the stray-caller grep confirms no other file calls `AccountingService`'s old internal implementation directly.

---

## Self-Review Notes

- **Spec coverage:** location/naming (Task 1/2), narrow db wrapper with no `SalesDbModule` (Task 1), usecase with cache moved in (Task 2), thin service delegate + dropped unused deps (Task 3), module wiring (Task 3), test relocation (Tasks 2/3) — all covered.
- **Placeholder scan:** no TBD/TODO; every step has literal code.
- **Type consistency:** `IGetAmortizationUsecaseDb.findBySeason`/`getRealizedProfitPerMatch` (Task 1) match the names `GetAmortizationUsecase` calls in Task 2; `IGetAmortizationUsecase.execute(userId, seasonStartYear)` (Task 2) matches the call in `AccountingService.getAmortization` (Task 3).
