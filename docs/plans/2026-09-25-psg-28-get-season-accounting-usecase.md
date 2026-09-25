# PSG-28: Extract `AccountingService.getSeason` into `GetSeasonAccountingUsecase` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `AccountingService.getSeason` (the real logic behind `getCurrentSeason`/`getGivenSeason`/`getAllTime`), its private `getAccounting` helper, and the module-level `computeLeadTime`/`leadDays` functions into `src/api/accounting/usecases/get-season-accounting/`, split into `get-season-accounting.usecase.ts` (business logic, no ORM import) + `get-season-accounting.usecase.db.ts` (the only file in the usecase folder that imports the ORM, scoped to exactly the accounting/sales/season-passes queries it needs).

**Architecture:** Same three-file usecase shape PSG-26 (`commit-sales-import`) and PSG-27 (`ask-question`) already established: `<name>.usecase.ts` (interface token + class), `<name>.usecase.db.ts` (interface token + class wrapping existing db tokens — this usecase needs one, unlike `ask-question`, because it does real accounting/sales/season-passes reads), `<name>.usecase.module.ts` (colocated module registering both, exporting only the usecase token — supersedes the issue's literal "register as a provider in accounting.module.ts" wording, per the PSG-24/26/27 precedent). `getCurrentSeason`/`getGivenSeason`/`getAllTime` become one-line delegates on `AccountingService`; `getAccounting` is removed from `IAccountingService` entirely (confirmed by grep: nothing outside `accounting.service.ts`/its spec calls it). `getAmortization` is untouched.

**Tech Stack:** NestJS 12 + Prisma 6 (`src/`), Vitest 5 + `vitest-mock-extended` (`npm test` = `vitest run`), `dependency-cruiser` for layering rules. No new dependencies — if a task seems to need one, stop and escalate.

**Spec of record:** `docs/specs/2026-09-25-get-season-accounting-usecase-design.md`. Read it before Task 1, especially the section on `IGetSeasonAccountingUsecaseDb`'s narrow surface and the module-registration deviation from the issue's literal wording.

## Global Constraints

- **Pure refactor. No behaviour change** beyond removing `getAccounting` from `IAccountingService` (issue-mandated). No changed cache key, no changed redis TTL, no changed lead-time math, no changed season-investment cutoff rule.
- **`get-season-accounting.usecase.ts` must not import `@prisma/client`, `PrismaService`, or any runtime member of `src/db/**`** (type-only imports are fine).
- **`get-season-accounting.usecase.db.ts` is the only file in the usecase folder that imports the ORM** — indirectly, by depending on the existing `IAccountingDbService`/`ISalesDbService`/`ISeasonPassesDbService` tokens. It never imports `@prisma/client` or `PrismaService` directly, and exposes only the five methods this usecase calls: `getAccounting`, `getSoldLeadTimes`, `getOneByWithFullMatch`, `findBySeason`, `findAll`.
- **Comments move verbatim** with the code they explain: the season-investment-cutoff comment (why an all-time view only counts passes for already-started seasons), the lead-days clamp comment, and the median-index-safety comment on `computeLeadTime`.
- **`getAmortization` and `emptyAmortization` are out of scope** — do not touch their bodies, imports they alone need, or their tests.
- **Files never edited in any task:** `src/api/accounting/accounting.controller.ts`, `src/api/accounting/dto/**`, `src/api/accounting/types/**`, `src/api/accounting/utils/**` (only imported, not modified), `src/db/**`, `src/redis/**`, `web/**`, `.dependency-cruiser.cjs`, `tsconfig*.json`, `package.json`.
- Explicit return types on every function/method, including `Promise<void>`. Constructor-injected dependencies are `private readonly`. No single-letter locals (loop counters excepted). No inline `if` — always braced. Blank line before `if`/`for`/`while`/`return`/`throw` unless first in block.
- Jest/Vitest structure: a `describe` per condition, `it` titles state only the outcome.
- **Line numbers drift — re-read every file before editing it.** Refer to symbols, not line numbers.
- **Gate after every task, green before proceeding:** `npm run lint && npm run typecheck && npm test`. Task 4 adds `npm run lint:deps`, `npm run build`, `test -f dist/main.js`. **No task may end with a red suite.**
- Commit after each task (conventional-commits style, `commitlint` is active).

---

## Parallelism

**Backend only. No frontend work exists in this plan — `web/` is not touched by any task.** Tasks are sequential and build on each other's file contents: 1 (db wrapper) → 2 (usecase, depends on 1) → 3 (service wiring, depends on 2) → 4 (verification). No independent backend/frontend split is possible or needed; run 1 → 2 → 3 → 4 in order.

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.ts` | `GetSeasonAccountingUsecaseDb` + `IGetSeasonAccountingUsecaseDb` — narrow wrapper over `IAccountingDbService`/`ISalesDbService`/`ISeasonPassesDbService` |
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.spec.ts` | Delegation tests for the wrapper |
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.ts` | `GetSeasonAccountingUsecase` + `IGetSeasonAccountingUsecase` — `execute`, private `getAccounting`, module-level `computeLeadTime`/`leadDays` |
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.spec.ts` | Moved `getAccounting`/`getSeason`/lead-time-aggregation tests, retargeted to `execute()` |
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.module.ts` | `GetSeasonAccountingUsecaseModule` — registers both providers, exports the usecase token |

**Modified:**

| File | Change |
|---|---|
| `src/api/accounting/accounting.service.ts` | Loses `getAccounting`, `getSeason`'s body, `computeLeadTime`/`leadDays`; `getCurrentSeason`/`getGivenSeason`/`getAllTime` become one-line delegates; gains `IGetSeasonAccountingUsecase` dependency |
| `src/api/accounting/interfaces/accounting.service.interface.ts` | Removes `getAccounting` |
| `src/api/accounting/accounting.module.ts` | Imports `GetSeasonAccountingUsecaseModule` |
| `src/api/accounting/accounting.service.spec.ts` | Loses `getAccounting`/`getSeason`/lead-time-aggregation describes; `getCurrentSeason`/`getGivenSeason`/`getAllTime` retargeted to mock `IGetSeasonAccountingUsecase.execute` instead of spying on `service.getSeason` |

**Untouched:** the never-edited list in Global Constraints; `getAmortization`'s describe block in `accounting.service.spec.ts`.

---

## Task 1 — Create `GetSeasonAccountingUsecaseDb` + its spec

Standalone: no dependency on Task 2/3. This is the only file in the usecase folder that imports the ORM (indirectly, via the existing db tokens).

**Files:**
- Create: `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.ts`
- Create: `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.spec.ts`

**Interfaces:**
- Consumes (exist, unchanged): `IAccountingDbService.getAccounting(userId, statuses, from, to?)`, `IAccountingDbService.getSoldLeadTimes(userId, from, to?)` (`src/db/accounting/accounting.db.interface.ts`); `ISalesDbService.getOneByWithFullMatch(query)` (`src/db/sales/sales.db.interface.ts`); `ISeasonPassesDbService.findBySeason(userId, seasonStartYear)`, `ISeasonPassesDbService.findAll(userId)` (`src/db/season-passes/season-passes.db.interface.ts`).
- Produces (Task 2 relies on these exact names): abstract class `IGetSeasonAccountingUsecaseDb` with `getAccounting`, `getSoldLeadTimes`, `getOneByWithFullMatch`, `findBySeason`, `findAll`; class `GetSeasonAccountingUsecaseDb`; exported type `SaleExtremeQuery`.

- [ ] **Step 1: Write the failing spec**

Create `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { GetSeasonAccountingUsecaseDb } from './get-season-accounting.usecase.db';
import { IAccountingDbService } from '../../../../db/accounting/accounting.db.interface';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import type { AccountingAggregate } from '../../../../db/accounting/types/get-accounting.type';
import type { SoldLeadTime } from '../../../../db/accounting/types/sold-lead-time.type';
import type { SaleWithFullMatch } from '../../../../db/sales/type/sale-with-full-match.type';
import type { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';

describe('GetSeasonAccountingUsecaseDb', () => {
    let usecaseDb: GetSeasonAccountingUsecaseDb;
    let accountingDb: DeepMockProxy<IAccountingDbService>;
    let salesDb: DeepMockProxy<ISalesDbService>;
    let seasonPassesDb: DeepMockProxy<ISeasonPassesDbService>;

    const userId = 'user-uuid' as UserId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                GetSeasonAccountingUsecaseDb,
                {
                    provide: IAccountingDbService,
                    useValue: mockDeep<IAccountingDbService>(),
                },
                { provide: ISalesDbService, useValue: mockDeep<ISalesDbService>() },
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<ISeasonPassesDbService>(),
                },
            ],
        }).compile();

        usecaseDb = module.get(GetSeasonAccountingUsecaseDb);
        accountingDb = module.get(IAccountingDbService);
        salesDb = module.get(ISalesDbService);
        seasonPassesDb = module.get(ISeasonPassesDbService);

        module.useLogger(false);
    });

    describe('getAccounting', () => {
        it('delegates to IAccountingDbService with the same arguments', async () => {
            const aggregate = { _min: {}, _max: {} } as AccountingAggregate;
            accountingDb.getAccounting.mockResolvedValueOnce(aggregate);

            const from = new Date('2025-08-01');
            const to = new Date('2026-07-31');
            const result = await usecaseDb.getAccounting(
                userId,
                [SaleStatus.SOLD],
                from,
                to,
            );

            expect(accountingDb.getAccounting).toHaveBeenCalledWith(
                userId,
                [SaleStatus.SOLD],
                from,
                to,
            );
            expect(result).toBe(aggregate);
        });
    });

    describe('getSoldLeadTimes', () => {
        it('delegates to IAccountingDbService with the same arguments', async () => {
            const rows = [
                { soldAt: new Date(), matchDate: new Date() },
            ] as SoldLeadTime[];
            accountingDb.getSoldLeadTimes.mockResolvedValueOnce(rows);

            const from = new Date('2025-08-01');
            const result = await usecaseDb.getSoldLeadTimes(userId, from);

            expect(accountingDb.getSoldLeadTimes).toHaveBeenCalledWith(
                userId,
                from,
                undefined,
            );
            expect(result).toBe(rows);
        });
    });

    describe('getOneByWithFullMatch', () => {
        it('delegates to ISalesDbService with the same query', async () => {
            const match = {
                Match: { Opponent: { name: 'opponent' } },
            } as SaleWithFullMatch;
            salesDb.getOneByWithFullMatch.mockResolvedValueOnce(match);

            const query = { userId, matchDateFrom: new Date('2025-08-01') };
            const result = await usecaseDb.getOneByWithFullMatch(query);

            expect(salesDb.getOneByWithFullMatch).toHaveBeenCalledWith(query);
            expect(result).toBe(match);
        });
    });

    describe('findBySeason', () => {
        it('delegates to ISeasonPassesDbService with the same arguments', async () => {
            const passes = [{ id: 'pass-1' }] as SeasonPass[];
            seasonPassesDb.findBySeason.mockResolvedValueOnce(passes);

            const result = await usecaseDb.findBySeason(userId, 2025 as SeasonYear);

            expect(seasonPassesDb.findBySeason).toHaveBeenCalledWith(userId, 2025);
            expect(result).toBe(passes);
        });
    });

    describe('findAll', () => {
        it('delegates to ISeasonPassesDbService with the same arguments', async () => {
            const passes = [{ id: 'pass-1' }] as SeasonPass[];
            seasonPassesDb.findAll.mockResolvedValueOnce(passes);

            const result = await usecaseDb.findAll(userId);

            expect(seasonPassesDb.findAll).toHaveBeenCalledWith(userId);
            expect(result).toBe(passes);
        });
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.spec.ts`
Expected: FAIL — `get-season-accounting.usecase.db.ts` does not exist yet.

- [ ] **Step 3: Create `get-season-accounting.usecase.db.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';
import type { Profit } from '@psg/shared/money';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { IAccountingDbService } from '../../../../db/accounting/accounting.db.interface';
import { AccountingAggregate } from '../../../../db/accounting/types/get-accounting.type';
import { SoldLeadTime } from '../../../../db/accounting/types/sold-lead-time.type';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { SaleWithFullMatch } from '../../../../db/sales/type/sale-with-full-match.type';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';

export type SaleExtremeQuery = {
    profit?: Profit;
    statuses?: SaleStatus[];
    userId: UserId;
    matchDateFrom: Date;
    matchDateTo?: Date;
};

// This usecase's entire db surface (PSG-28): exactly the accounting/sales/
// season-passes queries getSeason runs. It wraps the existing db tokens and
// never talks to Prisma directly — AccountingDb/SalesDb/SeasonPassesDb stay
// the single implementations of these queries, nothing is duplicated here.
export abstract class IGetSeasonAccountingUsecaseDb {
    abstract getAccounting(
        userId: UserId,
        statuses: SaleStatus[],
        from: Date,
        to?: Date,
    ): Promise<AccountingAggregate | null>;
    abstract getSoldLeadTimes(
        userId: UserId,
        from: Date,
        to?: Date,
    ): Promise<SoldLeadTime[]>;
    abstract getOneByWithFullMatch(query: SaleExtremeQuery): Promise<SaleWithFullMatch>;
    abstract findBySeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<SeasonPass[]>;
    abstract findAll(userId: UserId): Promise<SeasonPass[]>;
}

@Injectable()
export class GetSeasonAccountingUsecaseDb implements IGetSeasonAccountingUsecaseDb {
    constructor(
        private readonly accountingDb: IAccountingDbService,
        private readonly salesDb: ISalesDbService,
        private readonly seasonPassesDb: ISeasonPassesDbService,
    ) {}

    getAccounting(
        userId: UserId,
        statuses: SaleStatus[],
        from: Date,
        to?: Date,
    ): Promise<AccountingAggregate | null> {
        return this.accountingDb.getAccounting(userId, statuses, from, to);
    }

    getSoldLeadTimes(userId: UserId, from: Date, to?: Date): Promise<SoldLeadTime[]> {
        return this.accountingDb.getSoldLeadTimes(userId, from, to);
    }

    getOneByWithFullMatch(query: SaleExtremeQuery): Promise<SaleWithFullMatch> {
        return this.salesDb.getOneByWithFullMatch(query);
    }

    findBySeason(userId: UserId, seasonStartYear: SeasonYear): Promise<SeasonPass[]> {
        return this.seasonPassesDb.findBySeason(userId, seasonStartYear);
    }

    findAll(userId: UserId): Promise<SeasonPass[]> {
        return this.seasonPassesDb.findAll(userId);
    }
}
```

- [ ] **Step 4: Run the spec again**

Run: `npx vitest run src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: green. (This file is not wired into any module yet, so it's dead code the compiler and tests can still see — that's expected at this point.)

- [ ] **Step 6: Commit**

```bash
git add src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.ts src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.spec.ts
git commit -m "feat(accounting): add GetSeasonAccountingUsecaseDb (PSG-28)"
```

**Done when:** the db wrapper's 5 tests pass and the full gate is green.

---

## Task 2 — Create `GetSeasonAccountingUsecase` + module, with its own tests

Depends on Task 1's `IGetSeasonAccountingUsecaseDb`. Not yet wired into `AccountingService` — that's Task 3.

**Files:**
- Create: `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.ts`
- Create: `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.spec.ts`
- Create: `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.module.ts`

**Interfaces:**
- Consumes: `IGetSeasonAccountingUsecaseDb` from Task 1 (same 5 methods); `RedisService.get(key, ttl, loader)` (`src/redis/redis.service.ts`); `CACHE_KEYS.accounting` (`src/redis/CACHE_KEYS.ts`); `formatAggregate` (`src/api/accounting/utils/format-aggregate.util.ts`); `statusConverter` (`src/api/accounting/utils/status-converter.util.ts`); `seasonStartYearFromDate` (`src/shared/utils/season.utils.ts`); `AccountingDbModule`, `SalesDbModule`, `SeasonPassesDbModule`, `RedisModule`.
- Produces (Task 3 relies on these exact names): abstract class `IGetSeasonAccountingUsecase` with `execute(userId: UserId, dates: { start: Date; end?: Date }, seasonStartYear: SeasonYear | null): Promise<TimePeriodAccounting>`; class `GetSeasonAccountingUsecase`; module class `GetSeasonAccountingUsecaseModule`.

- [ ] **Step 1: Write the failing spec**

Create `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { GetSeasonAccountingUsecase } from './get-season-accounting.usecase';
import { IGetSeasonAccountingUsecaseDb } from './get-season-accounting.usecase.db';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { formatAggregate } from '../../utils/format-aggregate.util';
import { TimePeriodAccounting } from '../../types/time-period-accounting.type';
import { FormattedAggregate } from '../../types/formatted-aggregate.type';
import { AccountingAggregate } from '../../../../db/accounting/types/get-accounting.type';
import { SaleWithFullMatch } from '../../../../db/sales/type/sale-with-full-match.type';

vi.mock('../../utils/format-aggregate.util');
const formatAggregateMocked = vi.mocked(formatAggregate);

describe('GetSeasonAccountingUsecase', () => {
    let usecase: GetSeasonAccountingUsecase;
    let db: DeepMockProxy<IGetSeasonAccountingUsecaseDb>;
    let redisService: DeepMockProxy<RedisService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                GetSeasonAccountingUsecase,
                {
                    provide: IGetSeasonAccountingUsecaseDb,
                    useValue: mockDeep<IGetSeasonAccountingUsecaseDb>(),
                },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usecase = module.get(GetSeasonAccountingUsecase);
        db = module.get(IGetSeasonAccountingUsecaseDb);
        redisService = module.get(RedisService);

        module.useLogger(false);

        // RedisService.get follows a cache-aside contract: runs the loader
        // on a miss and returns its value. Default to "always miss" so
        // tests exercise the underlying logic unless they opt into a hit.
        redisService.get.mockImplementation(
            async <T>(_key: unknown, _ttl: number, loader: () => Promise<T | null>) =>
                loader(),
        );

        // Default every bucket-producing query to "nothing found"/"empty" so
        // each test only has to stub the calls it actually cares about.
        db.getAccounting.mockResolvedValue(null);
        db.getOneByWithFullMatch.mockResolvedValue({
            Match: { Opponent: { name: 'opponent' } },
        } as SaleWithFullMatch);
        db.getSoldLeadTimes.mockResolvedValue([]);
        db.findBySeason.mockResolvedValue([]);
        db.findAll.mockResolvedValue([]);
    });

    describe('execute — a single bucket (formerly the private getAccounting helper)', () => {
        // getAccounting is now a private method reached only through
        // execute(); execute() calls it once per status
        // (realized, unrealized, pending, gifted, in that order), so a test
        // that stubs only the first db.getAccounting call is exercising
        // exactly the same code path the old direct getAccounting() unit
        // tests exercised, via the realized bucket.
        describe('when there is no aggregate found', () => {
            it('leaves the realized bucket null', async () => {
                const userId = 'userId' as UserId;
                const dates = { start: new Date('2022-02-02') };

                const result = await usecase.execute(userId, dates, null);

                expect(result.realized).toBeNull();
                expect(db.getAccounting).toHaveBeenNthCalledWith(
                    1,
                    userId,
                    [SaleStatus.SOLD],
                    dates.start,
                    dates.end,
                );
            });
        });

        describe('when an aggregate is found', () => {
            const aggregate = {
                _min: { profit: 1 },
                _max: { profit: 1 },
            } as AccountingAggregate;
            const userId = 'userId' as UserId;
            const lowestMatch = {
                Match: { Opponent: { name: 'opponentLowest' } },
            } as SaleWithFullMatch;
            const highestMatch = {
                Match: { Opponent: { name: 'opponentHighest' } },
            } as SaleWithFullMatch;
            const formatResult = {} as FormattedAggregate;

            beforeEach(() => {
                db.getAccounting.mockResolvedValueOnce(aggregate);
                db.getOneByWithFullMatch
                    .mockResolvedValueOnce(lowestMatch)
                    .mockResolvedValueOnce(highestMatch);
                formatAggregateMocked.mockReturnValueOnce(formatResult);
            });

            describe('when the period has no end date', () => {
                it('returns the aggregated accounting for the realized bucket', async () => {
                    const dates = { start: new Date('2022-02-02') };

                    const result = await usecase.execute(userId, dates, null);

                    expect(result.realized).toEqual(formatResult);
                    expect(db.getOneByWithFullMatch).toHaveBeenCalledTimes(2);
                    expect(db.getOneByWithFullMatch).toHaveBeenNthCalledWith(1, {
                        profit: aggregate._min.profit,
                        statuses: [SaleStatus.SOLD],
                        userId,
                        matchDateFrom: dates.start,
                    });
                    expect(db.getOneByWithFullMatch).toHaveBeenNthCalledWith(2, {
                        profit: aggregate._max.profit,
                        statuses: [SaleStatus.SOLD],
                        userId,
                        matchDateFrom: dates.start,
                    });
                    expect(formatAggregateMocked).toHaveBeenCalledTimes(1);
                    expect(formatAggregateMocked).toHaveBeenCalledWith({
                        sum: aggregate._sum,
                        avg: aggregate._avg,
                        min: {
                            ...aggregate._min,
                            match: {
                                ...lowestMatch.Match,
                                opponent: lowestMatch.Match.Opponent.name,
                            },
                        },
                        max: {
                            ...aggregate._max,
                            match: {
                                ...highestMatch.Match,
                                opponent: highestMatch.Match.Opponent.name,
                            },
                        },
                    });
                });
            });

            describe('when the period has an end date', () => {
                it('includes matchDateTo in the extreme-sale lookup scope', async () => {
                    const dates = {
                        start: new Date('2026-07-01'),
                        end: new Date('2027-06-30'),
                    };

                    await usecase.execute(userId, dates, null);

                    expect(db.getOneByWithFullMatch).toHaveBeenNthCalledWith(1, {
                        profit: aggregate._min.profit,
                        statuses: [SaleStatus.SOLD],
                        userId,
                        matchDateFrom: dates.start,
                        matchDateTo: dates.end,
                    });
                    expect(db.getOneByWithFullMatch).toHaveBeenNthCalledWith(2, {
                        profit: aggregate._max.profit,
                        statuses: [SaleStatus.SOLD],
                        userId,
                        matchDateFrom: dates.start,
                        matchDateTo: dates.end,
                    });
                });
            });
        });
    });

    describe('execute — caching and the four buckets together', () => {
        describe('when there is cache', () => {
            it('should return the cache data', async () => {
                const expectedResult = {} as TimePeriodAccounting;
                redisService.get.mockResolvedValueOnce(expectedResult);

                const userId = 'userId' as UserId;
                const dates = { start: new Date('2022-02-02') };

                await expect(usecase.execute(userId, dates, null)).resolves.toEqual(
                    expectedResult,
                );
                expect(redisService.get).toHaveBeenCalledTimes(1);
                expect(redisService.get).toHaveBeenCalledWith(
                    CACHE_KEYS.accounting(userId, dates.start, dates.end),
                    24 * 60 * 60,
                    expect.any(Function),
                );
            });
        });

        describe('when there is no cache', () => {
            it('should return the accounting and set the cache', async () => {
                const userId = 'userId' as UserId;
                const dates = { start: new Date('2022-02-02') };
                const realized = {} as FormattedAggregate;
                const unrealized = {} as FormattedAggregate;
                const pending = {} as FormattedAggregate;
                const gifted = {} as FormattedAggregate;

                db.getAccounting.mockResolvedValue({
                    _min: {},
                    _max: {},
                } as AccountingAggregate);
                formatAggregateMocked
                    .mockReturnValueOnce(realized)
                    .mockReturnValueOnce(unrealized)
                    .mockReturnValueOnce(pending)
                    .mockReturnValueOnce(gifted);

                const expectedResult: TimePeriodAccounting = {
                    realized,
                    unrealized,
                    pending,
                    gifted,
                    seasonInvestments: [],
                    totalSeasonInvestment: 0,
                    leadTime: null,
                };

                await expect(usecase.execute(userId, dates, null)).resolves.toEqual(
                    expectedResult,
                );
                expect(redisService.get).toHaveBeenCalledTimes(1);
                expect(redisService.get).toHaveBeenCalledWith(
                    CACHE_KEYS.accounting(userId, dates.start, dates.end),
                    24 * 60 * 60,
                    expect.any(Function),
                );
            });
        });

        describe('when the period has gifted sales', () => {
            it('returns the gifted sub-bucket alongside unrealized', async () => {
                const userId = 'userId' as UserId;
                const dates = {
                    start: new Date('2025-08-01'),
                    end: new Date('2026-07-31'),
                };
                const unrealized = {} as FormattedAggregate;
                const gifted = {} as FormattedAggregate;

                db.getAccounting.mockResolvedValue({
                    _min: {},
                    _max: {},
                } as AccountingAggregate);
                formatAggregateMocked
                    .mockReturnValueOnce({} as FormattedAggregate)
                    .mockReturnValueOnce(unrealized)
                    .mockReturnValueOnce({} as FormattedAggregate)
                    .mockReturnValueOnce(gifted);

                const result = await usecase.execute(userId, dates, 2025 as SeasonYear);

                expect(result.gifted).toBe(gifted);
                expect(result.unrealized).toBe(unrealized);
            });
        });
    });

    describe('execute — lead-time aggregation', () => {
        const userId = 'userUuid' as UserId;
        const dates = { start: new Date('2024-08-01'), end: new Date('2025-07-31') };

        it('returns null leadTime when no sold sales in range', async () => {
            db.getSoldLeadTimes.mockResolvedValueOnce([]);

            const result = await usecase.execute(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime).toBeNull();
        });

        it('computes avg/median/min/max lead days from soldAt vs match date', async () => {
            // lead days: 10, 5, 1 → sorted [1, 5, 10], avg 5.33→5.3, median 5
            db.getSoldLeadTimes.mockResolvedValueOnce([
                {
                    soldAt: new Date('2024-09-01T00:00:00Z'),
                    matchDate: new Date('2024-09-11T00:00:00Z'),
                },
                {
                    soldAt: new Date('2024-10-01T00:00:00Z'),
                    matchDate: new Date('2024-10-06T00:00:00Z'),
                },
                {
                    soldAt: new Date('2024-11-01T00:00:00Z'),
                    matchDate: new Date('2024-11-02T00:00:00Z'),
                },
            ]);

            const result = await usecase.execute(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime).toEqual({
                soldCount: 3,
                avgLeadDays: 5.3,
                medianLeadDays: 5,
                minLeadDays: 1,
                maxLeadDays: 10,
            });
        });

        it('clamps negative lead days to 0 (defensive against legacy backfill)', async () => {
            db.getSoldLeadTimes.mockResolvedValueOnce([
                {
                    soldAt: new Date('2024-09-15T00:00:00Z'),
                    matchDate: new Date('2024-09-10T00:00:00Z'),
                },
            ]);

            const result = await usecase.execute(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime).toEqual({
                soldCount: 1,
                avgLeadDays: 0,
                medianLeadDays: 0,
                minLeadDays: 0,
                maxLeadDays: 0,
            });
        });

        it('averages the two middle values for an even-length sample', async () => {
            // 2, 4, 6, 10 → median = (4+6)/2 = 5
            db.getSoldLeadTimes.mockResolvedValueOnce([
                {
                    soldAt: new Date('2024-09-01T00:00:00Z'),
                    matchDate: new Date('2024-09-03T00:00:00Z'),
                },
                {
                    soldAt: new Date('2024-10-01T00:00:00Z'),
                    matchDate: new Date('2024-10-05T00:00:00Z'),
                },
                {
                    soldAt: new Date('2024-11-01T00:00:00Z'),
                    matchDate: new Date('2024-11-07T00:00:00Z'),
                },
                {
                    soldAt: new Date('2024-12-01T00:00:00Z'),
                    matchDate: new Date('2024-12-11T00:00:00Z'),
                },
            ]);

            const result = await usecase.execute(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime?.medianLeadDays).toBe(5);
        });
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.spec.ts`
Expected: FAIL — `get-season-accounting.usecase.ts` does not exist yet.

- [ ] **Step 3: Create `get-season-accounting.usecase.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { SoldCount } from '@psg/shared/counts';
import type { UserId } from '@psg/shared/ids';
import type { LeadDays, SeasonYear } from '@psg/shared/time';
import { Accounting } from '../../types/accounting.type';
import type { AccountingStatus } from '../../types/accounting-status.type';
import {
    SeasonInvestment,
    TimePeriodAccounting,
} from '../../types/time-period-accounting.type';
import { LeadTime } from '../../types/lead-time.type';
import { formatAggregate } from '../../utils/format-aggregate.util';
import { statusConverter } from '../../utils/status-converter.util';
import { seasonStartYearFromDate } from '../../../../shared/utils/season.utils';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { ONE_DAY_TTL } from '../../../../shared/constants';
import { SoldLeadTime } from '../../../../db/accounting/types/sold-lead-time.type';
import { IGetSeasonAccountingUsecaseDb } from './get-season-accounting.usecase.db';

export abstract class IGetSeasonAccountingUsecase {
    abstract execute(
        userId: UserId,
        dates: { start: Date; end?: Date },
        seasonStartYear: SeasonYear | null,
    ): Promise<TimePeriodAccounting>;
}

// The season half of the accounting module (PSG-28): parallel-fetches the
// four accounting buckets, season-pass data, and lead times; applies the
// season-investment cutoff rule; computes lead-time stats; redis-cached.
// Extracted from AccountingService.getSeason — byte-identical logic.
@Injectable()
export class GetSeasonAccountingUsecase implements IGetSeasonAccountingUsecase {
    constructor(
        private readonly db: IGetSeasonAccountingUsecaseDb,
        private readonly redisService: RedisService,
    ) {}

    async execute(
        userId: UserId,
        dates: { start: Date; end?: Date },
        seasonStartYear: SeasonYear | null,
    ): Promise<TimePeriodAccounting> {
        const accounting = await this.redisService.get(
            CACHE_KEYS.accounting(userId, dates.start, dates.end),
            ONE_DAY_TTL,
            async () => {
                const [
                    realizedAccounting,
                    unrealizedAccounting,
                    pendingAccounting,
                    giftedAccounting,
                    seasonPasses,
                    allPasses,
                    leadTimes,
                ] = await Promise.all([
                    this.getAccounting(userId, 'realized', dates),
                    this.getAccounting(userId, 'unrealized', dates),
                    this.getAccounting(userId, 'pending', dates),
                    this.getAccounting(userId, 'gifted', dates),
                    seasonStartYear !== null
                        ? this.db.findBySeason(userId, seasonStartYear)
                        : Promise.resolve([]),
                    seasonStartYear === null
                        ? this.db.findAll(userId)
                        : Promise.resolve([]),
                    this.db.getSoldLeadTimes(userId, dates.start, dates.end),
                ]);

                const seasonInvestments: SeasonInvestment[] = seasonPasses.map(
                    (pass) => ({
                        id: pass.id,
                        price: pass.price,
                        seasonStartYear: pass.seasonStartYear,
                        label: pass.label,
                        category: pass.category,
                        row: pass.row,
                        seat: pass.seat,
                    }),
                );

                // For the all-time view, only count passes for seasons that
                // have already started — a future season's pass is paid but
                // not yet "in use", so including it would understate the
                // historical net.
                const currentSeasonStartYear = seasonStartYearFromDate(new Date());
                const totalSeasonInvestment =
                    seasonStartYear === null
                        ? allPasses
                              .filter(
                                  (pass) =>
                                      pass.seasonStartYear <= currentSeasonStartYear,
                              )
                              .reduce((sum, pass) => sum + pass.price, 0)
                        : seasonInvestments.reduce((sum, pass) => sum + pass.price, 0);

                const result: TimePeriodAccounting = {
                    realized: realizedAccounting,
                    unrealized: unrealizedAccounting,
                    pending: pendingAccounting,
                    gifted: giftedAccounting,
                    seasonInvestments,
                    totalSeasonInvestment,
                    leadTime: computeLeadTime(leadTimes),
                };

                return result;
            },
        );

        return (
            accounting ?? {
                realized: null,
                pending: null,
                unrealized: null,
                gifted: null,
                seasonInvestments: [],
                totalSeasonInvestment: 0,
                leadTime: null,
            }
        );
    }

    private async getAccounting(
        userId: UserId,
        status: AccountingStatus,
        date: {
            start: Date;
            end?: Date;
        },
    ): Promise<Accounting | null> {
        const aggregate = await this.db.getAccounting(
            userId,
            statusConverter(status),
            date.start,
            date.end,
        );

        if (!aggregate) {
            return null;
        }

        const scope = {
            statuses: statusConverter(status),
            userId,
            matchDateFrom: date.start,
            ...(date.end ? { matchDateTo: date.end } : {}),
        };

        const [lowestMatch, highestMatch] = await Promise.all([
            this.db.getOneByWithFullMatch({
                profit: aggregate._min.profit,
                ...scope,
            }),
            this.db.getOneByWithFullMatch({
                profit: aggregate._max.profit,
                ...scope,
            }),
        ]);

        return formatAggregate({
            sum: aggregate._sum,
            avg: aggregate._avg,
            min: {
                ...aggregate._min,
                match: {
                    ...lowestMatch.Match,
                    opponent: lowestMatch.Match.Opponent.name,
                },
            },
            max: {
                ...aggregate._max,
                match: {
                    ...highestMatch.Match,
                    opponent: highestMatch.Match.Opponent.name,
                },
            },
        });
    }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function leadDays(soldAt: Date, matchDate: Date): LeadDays {
    // Sale-after-kickoff is rejected at the api layer, so this is always ≥ 0;
    // clamp defensively against legacy/backfilled rows.
    return Math.max(
        0,
        Math.floor((matchDate.getTime() - soldAt.getTime()) / MS_PER_DAY),
    ) as LeadDays;
}

function computeLeadTime(rows: SoldLeadTime[]): LeadTime | null {
    if (rows.length === 0) {
        return null;
    }

    const days = rows.map((row) => leadDays(row.soldAt, row.matchDate));
    const sorted = [...days].sort((firstDay, secondDay) => firstDay - secondDay);
    const sum = days.reduce((acc, day) => acc + day, 0);
    const mid = Math.floor(sorted.length / 2);
    // rows.length > 0 (checked above) guarantees sorted/days are non-empty,
    // so every index below is in bounds.
    const median =
        sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;

    return {
        soldCount: rows.length as SoldCount,
        avgLeadDays: (Math.round((sum / rows.length) * 10) / 10) as LeadDays,
        medianLeadDays: (Math.round(median * 10) / 10) as LeadDays,
        minLeadDays: sorted[0]!,
        maxLeadDays: sorted[sorted.length - 1]!,
    };
}
```

**Diff this against the current `accounting.service.ts` (lines 66–213, 310–342) comment-for-comment** — the season-investment-cutoff comment, the lead-days clamp comment, and the median-safety comment must be byte-identical.

- [ ] **Step 4: Run the spec again**

Run: `npx vitest run src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.spec.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Create `get-season-accounting.usecase.module.ts`**

```ts
import { Module } from '@nestjs/common';

import { AccountingDbModule } from '../../../../db/accounting/accounting.db.module';
import { SalesDbModule } from '../../../../db/sales/sales.db.module';
import { SeasonPassesDbModule } from '../../../../db/season-passes/season-passes.db.module';
import { RedisModule } from '../../../../redis/redis.module';
import {
    GetSeasonAccountingUsecase,
    IGetSeasonAccountingUsecase,
} from './get-season-accounting.usecase';
import {
    GetSeasonAccountingUsecaseDb,
    IGetSeasonAccountingUsecaseDb,
} from './get-season-accounting.usecase.db';

@Module({
    imports: [AccountingDbModule, SalesDbModule, SeasonPassesDbModule, RedisModule],
    providers: [
        {
            provide: IGetSeasonAccountingUsecaseDb,
            useClass: GetSeasonAccountingUsecaseDb,
        },
        { provide: IGetSeasonAccountingUsecase, useClass: GetSeasonAccountingUsecase },
    ],
    exports: [IGetSeasonAccountingUsecase],
})
export class GetSeasonAccountingUsecaseModule {}
```

`RedisModule` is mandatory — it is not `@Global()` (deglobalized 2026-09-18).

- [ ] **Step 6: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: green. `accounting.service.ts` is untouched so far — this task only adds new, currently-unwired files.

- [ ] **Step 7: Commit**

```bash
git add src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.ts src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.spec.ts src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.module.ts
git commit -m "feat(accounting): add GetSeasonAccountingUsecase (PSG-28)"
```

**Done when:** the usecase's 12 tests pass and the full gate is green, with `accounting.service.ts` still untouched.

---

## Task 3 — Wire `AccountingService` to delegate; remove `getAccounting` from the interface

Depends on Task 2. This is the task that changes runtime wiring.

**Files:**
- Modify: `src/api/accounting/accounting.service.ts`
- Modify: `src/api/accounting/interfaces/accounting.service.interface.ts`
- Modify: `src/api/accounting/accounting.module.ts`
- Modify: `src/api/accounting/accounting.service.spec.ts`

**Interfaces:**
- Consumes: `IGetSeasonAccountingUsecase` + `GetSeasonAccountingUsecaseModule` from Task 2 (exact names, `execute(userId, dates, seasonStartYear)`).

- [ ] **Step 1: Remove `getAccounting` from `IAccountingService`**

Read the current `src/api/accounting/interfaces/accounting.service.interface.ts` first (it hasn't changed since this plan was written). Replace its full contents with:

```ts
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { Amortization } from '../types/amortization.type';
import { TimePeriodAccounting } from '../types/time-period-accounting.type';

export abstract class IAccountingService {
    abstract getCurrentSeason(userId: UserId): Promise<TimePeriodAccounting>;
    abstract getGivenSeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<TimePeriodAccounting>;
    abstract getAllTime(userId: UserId): Promise<TimePeriodAccounting>;
    abstract getAmortization(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<Amortization>;
}
```

- [ ] **Step 2: Rewrite `accounting.service.ts` as the thin delegate**

Read the current file first. Replace `getCurrentSeason`, `getGivenSeason`, `getAllTime`, `getAccounting`, `getSeason`, the module-level `MS_PER_DAY`/`leadDays`/`computeLeadTime`, and the constructor, keeping `getAmortization` and `emptyAmortization` byte-identical. Full target content:

```ts
import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { IAccountingDbService } from '../../db/accounting/accounting.db.interface';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import {
    getCurrentSeasonDate,
    getSeasonWindow,
    seasonStartYearFromDate,
} from '../../shared/utils/season.utils';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { ONE_DAY_TTL } from '../../shared/constants';
import { IAccountingService } from './interfaces/accounting.service.interface';
import { Amortization, AmortizationMatchRow } from './types/amortization.type';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import { IGetSeasonAccountingUsecase } from './usecases/get-season-accounting/get-season-accounting.usecase';

@Injectable()
export class AccountingService implements IAccountingService {
    constructor(
        private readonly accountingDbService: IAccountingDbService,
        private readonly salesDbService: ISalesDbService,
        private readonly seasonPassesDbService: ISeasonPassesDbService,
        private readonly redisService: RedisService,
        private readonly getSeasonAccountingUsecase: IGetSeasonAccountingUsecase,
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
        const result = await this.redisService.get(
            CACHE_KEYS.amortization(userId, seasonStartYear),
            ONE_DAY_TTL,
            async () => {
                const dates = getSeasonWindow(seasonStartYear, 'inclusive');

                const [passes, matchRows] = await Promise.all([
                    this.seasonPassesDbService.findBySeason(userId, seasonStartYear),
                    this.accountingDbService.getRealizedProfitPerMatch(
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

- [ ] **Step 3: Rewire `accounting.module.ts`**

Full target content:

```ts
import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AccountingDbModule } from '../../db/accounting/accounting.db.module';
import { SalesDbModule } from '../../db/sales/sales.db.module';
import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { RedisModule } from '../../redis/redis.module';
import { IAccountingService } from './interfaces/accounting.service.interface';
import { GetSeasonAccountingUsecaseModule } from './usecases/get-season-accounting/get-season-accounting.usecase.module';

@Module({
    imports: [
        AccountingDbModule,
        SalesDbModule,
        SeasonPassesDbModule,
        RedisModule,
        GetSeasonAccountingUsecaseModule,
    ],
    controllers: [AccountingController],
    providers: [{ provide: IAccountingService, useClass: AccountingService }],
    exports: [IAccountingService],
})
export class AccountingModule {}
```

The four existing imports (`AccountingDbModule`, `SalesDbModule`, `SeasonPassesDbModule`, `RedisModule`) stay — `AccountingService` still uses them directly for `getAmortization` and `getAllTime`. Only `GetSeasonAccountingUsecaseModule` is added.

- [ ] **Step 4: Rewrite `accounting.service.spec.ts`**

Read the current file first. Full target content:

```ts
import { Test } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { SalesDb } from '../../db/sales/sales.db';
import { RedisService } from '../../redis/redis.service';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { AccountingDb } from '../../db/accounting/accounting.db';
import { SeasonPassesDb } from '../../db/season-passes/season-passes.db';
import { IAccountingDbService } from '../../db/accounting/accounting.db.interface';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { OldestMatchSale } from '../../db/sales/type/oldest-match-sale.type';
import { MatchRealizedProfit } from '../../db/accounting/types/match-realized-profit.type';
import { SeasonPass } from '../../db/season-passes/type/season-pass.type';
import { IGetSeasonAccountingUsecase } from './usecases/get-season-accounting/get-season-accounting.usecase';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
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
    let accountingDbService: DeepMockProxy<AccountingDb>;
    let seasonPassesDbService: DeepMockProxy<SeasonPassesDb>;
    let redisService: DeepMockProxy<RedisService>;
    let getSeasonAccountingUsecase: DeepMockProxy<IGetSeasonAccountingUsecase>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                AccountingService,
                {
                    provide: IAccountingDbService,
                    useValue: mockDeep<AccountingDb>(),
                },
                {
                    provide: ISalesDbService,
                    useValue: mockDeep<SalesDb>(),
                },
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<SeasonPassesDb>(),
                },
                {
                    provide: RedisService,
                    useValue: mockDeep<RedisService>(),
                },
                {
                    provide: IGetSeasonAccountingUsecase,
                    useValue: mockDeep<IGetSeasonAccountingUsecase>(),
                },
            ],
        }).compile();

        service = module.get(AccountingService);
        salesDbService = module.get(ISalesDbService);
        accountingDbService = module.get(IAccountingDbService);
        seasonPassesDbService = module.get(ISeasonPassesDbService);
        redisService = module.get(RedisService);
        getSeasonAccountingUsecase = module.get(IGetSeasonAccountingUsecase);

        module.useLogger(false);

        // RedisService.get now follows a cache-aside contract: it runs the
        // loader on a miss and returns its value. Default to "always miss"
        // so tests exercise the underlying logic unless they opt into a hit.
        redisService.get.mockImplementation(
            async <T>(_key: unknown, _ttl: number, loader: () => Promise<T | null>) =>
                loader(),
        );
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

        it('returns zeroed result when no sales and no pass', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([]);

            const result = await service.getAmortization(userId, seasonStartYear);

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
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(1000)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 200,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.hasPass).toBe(true);
            expect(result.passPrice).toBe(1000);
            expect(result.totalRealized).toBe(200);
            expect(result.progress).toBe(0.2);
            expect(result.remaining).toBe(800);
            expect(result.surplus).toBe(0);
            expect(result.breakEven).toBeNull();
        });

        it('flags the first match whose cumulative crosses pass price', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(300)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
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

            const result = await service.getAmortization(userId, seasonStartYear);

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
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(100)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 500,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.progress).toBe(1);
            expect(result.surplus).toBe(400);
        });

        it('treats missing pass as no progress; surplus tracks total realized', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 300,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

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
            };
            redisService.get.mockReset();
            redisService.get.mockResolvedValueOnce(cachedValue);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result).toEqual(cachedValue);
            expect(accountingDbService.getRealizedProfitPerMatch).not.toHaveBeenCalled();
            expect(seasonPassesDbService.findBySeason).not.toHaveBeenCalled();
        });

        it('delegates caching to redis with the right key and ttl', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(100)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 100,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(redisService.get).toHaveBeenCalledTimes(1);
            expect(redisService.get).toHaveBeenCalledWith(
                CACHE_KEYS.amortization(userId, seasonStartYear),
                24 * 60 * 60,
                expect.any(Function),
            );
            expect(result.progress).toBe(1);
        });
    });
});
```

**Read the current `getAmortization` describe block before this step and diff it against what's above** — it is copied unchanged; only the file's other describes (`getAccounting`, `getSeason`, `getSeason — lead-time aggregation`) and their now-unused imports (`SaleStatus`, `AccountingAggregate`, `formatAggregate`, `FormattedAggregate`, `SaleWithFullMatch`, `Accounting`, the `vi.mock('./utils/format-aggregate.util')` block) are removed, and the three thin-delegate tests are retargeted to `getSeasonAccountingUsecase.execute`.

- [ ] **Step 5: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: green. `src/app.module.spec.ts` (compiles the whole DI graph) must also pass — a missing `imports` entry in `GetSeasonAccountingUsecaseModule` fails it.

- [ ] **Step 6: Commit**

```bash
git add src/api/accounting/
git commit -m "refactor(accounting): delegate getSeason to GetSeasonAccountingUsecase (PSG-28)"
```

**Done when:** `accounting.service.ts` is ~90 lines shorter (only `getAmortization`, `emptyAmortization`, and the three thin delegates remain), `IAccountingService` no longer declares `getAccounting`, and the full gate is green.

---

## Task 4 — Full verification, sweeps, final commit

**Files:** none created or edited — this task reads and runs only. (If a sweep fails, fix the offending file in the task where the failure belongs, then re-run.)

- [ ] **Step 1: Run the full gate**

Run:
```bash
npm run lint && npm run typecheck && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```
Expected: all green, `dist/main.js` exists (not `dist/src/main.js`). `lint:deps` confirms no layering violation in the new `usecases/get-season-accounting/` directory (the `.usecase.db.ts` must not resolve as importing Prisma directly — it only imports the existing db interfaces).

- [ ] **Step 2: Comment sweep**

Run: `git diff origin/main... -- src/api/accounting/accounting.service.ts | grep '^-' | grep '^\s*-\s*//'` (adjust base to the branch point if not `origin/main`). Every comment line deleted from `accounting.service.ts` — the season-investment-cutoff comment, the lead-days clamp comment, the median-safety comment — must appear, byte-identical, in `get-season-accounting.usecase.ts`.

- [ ] **Step 3: Leftover-reference sweep**

Run: `grep -n "getAccounting\|computeLeadTime\|leadDays\b" src/api/accounting/accounting.service.ts`
Expected: no matches — all three now live only in the usecase file.

Run: `grep -rn "\.getAccounting(" src/` (excluding the new usecase folder)
Expected: no matches outside `src/api/accounting/usecases/get-season-accounting/` — confirms `getAccounting` really is gone from the public interface with no remaining caller.

- [ ] **Step 4: Untouched-list sweep**

Run: `git diff --stat origin/main...` (adjust base as above). Confirm zero changed lines in: `src/api/accounting/accounting.controller.ts`, `src/api/accounting/dto/**`, `src/api/accounting/types/**`, `src/api/accounting/utils/**`, `src/db/**`, `src/redis/**`, `web/**`, `.dependency-cruiser.cjs`, `tsconfig*.json`, `package.json`. The only changed files under `src/api/accounting/` should be `accounting.service.ts`, `interfaces/accounting.service.interface.ts`, `accounting.module.ts`, `accounting.service.spec.ts`, plus the five new usecase files.

- [ ] **Step 5: Confirm no tech-debt entry is needed**

This extraction defers nothing: the `.usecase.db.ts` wraps existing db tokens exactly as PSG-26's did, with no interim-shortcut flag needed (it is a clean physical delegation, not a narrow-interface-over-an-entangled-class situation). If, during the tasks, you encountered a genuine deferral not covered by the spec, **stop and escalate** rather than silently appending to `docs/tech-debt.md`.

- [ ] **Step 6: Final commit (if any sweep-driven fix landed)**

```bash
git add -A
git status --porcelain  # empty → nothing to commit; skip this step
git commit -m "refactor(accounting): finish get-season-accounting usecase extraction verification (PSG-28)"
```

**Done when:** all sweeps are green and the branch is committed.

---

## Self-Review (plan vs spec)

1. **Spec coverage:** Location/naming → Task 1 & 2 Steps 1/3/5. `.usecase.db.ts` narrow surface (5 methods, no direct Prisma import) → Task 1. Verbatim move of `getAccounting`, `getSeason` body, `computeLeadTime`/`leadDays`, comments → Task 2 Step 3 + Task 4 Step 2 (comment sweep). Thin `AccountingService` delegates, `getAllTime` keeping `ISalesDbService`, `getAmortization` untouched → Task 3 Steps 2–3. `IAccountingService` losing `getAccounting` → Task 3 Step 1 + Task 4 Step 3 (leftover-reference sweep). Module registration superseding the issue's literal wording → Task 2 Step 5 + Task 3 Step 3. Test strategy (move + retarget, new db spec) → Task 1 Step 1, Task 2 Step 1, Task 3 Step 4. Verification section → Task 4. Covered.
2. **Placeholder scan:** no TBD/TODO; every code step carries full file content or an exact mechanical instruction ("read the current file first", "diff comment-for-comment") keyed to content that exists in the repo today.
3. **Type consistency:** `IGetSeasonAccountingUsecase.execute(userId, dates, seasonStartYear): Promise<TimePeriodAccounting>` identical across Task 2 (definition), Task 3 Step 2 (three call sites), Task 3 Step 4 (mock). `IGetSeasonAccountingUsecaseDb`'s 5 methods identical across Task 1 (definition + wrapper) and Task 2 (usage + mocks). `GetSeasonAccountingUsecaseModule`/`GetSeasonAccountingUsecaseDb`/`GetSeasonAccountingUsecase` names consistent in Tasks 1, 2, 3.
