# Extract `AccountingService.getSeason` into its own usecase — Design

**Date:** 2026-09-25
**Status:** Draft
**Issue:** PSG-28
**Type:** Backend-only refactor. Net-zero at runtime. No API, behavior, or test-contract change beyond what the issue explicitly calls for (removing `getAccounting` from the public interface).

## Problem

The issue text is the spec of record for scope — see PSG-28, quoted in full in the task that produced this document. Summary: `AccountingService.getSeason` (`src/api/accounting/accounting.service.ts:123`) is the real logic behind the module's three season entry points. It parallel-fetches four accounting buckets via the private `getAccounting` helper (called 4x, not real public API despite sitting on `IAccountingService` today), season-pass data, and lead times; applies the season-investment cutoff rule for the all-time view; computes lead-time stats; and is redis-cached. This is extracted this into its own usecase, following the pattern already validated twice in this repo: PSG-26 (`src/api/sales-import/usecases/commit-sales-import/`) and PSG-27 (`src/api/ask/usecases/ask-question/`).

## Non-goals

- Changing any API request/response shape, cache key, error code, or runtime behavior, **except** removing `getAccounting` from `IAccountingService` (issue-mandated; confirmed by grep that nothing outside `accounting.service.ts`/its spec calls it).
- Touching `getAmortization` — untouched by the issue, stays on `AccountingService`, keeps its existing `accountingDbService`/`seasonPassesDbService`/`redisService` dependencies.
- Moving date/season-range resolution into the usecase — `execute(userId, dates, seasonStartYear)` takes already-resolved inputs, exactly as the issue specifies.
- Frontend changes. None — backend-only, confirmed by scope (only `src/api/accounting/**` and its module wiring change).

## Design decisions (following the PSG-26/PSG-27 pattern exactly)

### Location and naming

```
src/api/accounting/usecases/get-season-accounting/
  get-season-accounting.usecase.ts        # GetSeasonAccountingUsecase + IGetSeasonAccountingUsecase
  get-season-accounting.usecase.db.ts     # GetSeasonAccountingUsecaseDb + IGetSeasonAccountingUsecaseDb
  get-season-accounting.usecase.module.ts # GetSeasonAccountingUsecaseModule
  get-season-accounting.usecase.spec.ts
  get-season-accounting.usecase.db.spec.ts
```

Unlike `ask-question` (no db file — service composition only) and like `commit-sales-import` (has a db file), this usecase gets a `.usecase.db.ts`: it does real accounting/sales/season-passes reads, not just calls to sibling services.

### `get-season-accounting.usecase.db.ts` — narrow wrapper over existing db tokens, not new Prisma access

Same shape as `CommitSalesImportUsecaseDb`: it depends on the existing `IAccountingDbService`, `ISalesDbService`, `ISeasonPassesDbService` tokens and exposes only the methods this usecase calls — never Prisma directly, never the modules' full interfaces:

```ts
export abstract class IGetSeasonAccountingUsecaseDb {
    abstract getAccounting(userId, statuses, from, to?): Promise<AccountingAggregate | null>;
    abstract getSoldLeadTimes(userId, from, to?): Promise<SoldLeadTime[]>;
    abstract getOneByWithFullMatch(query): Promise<SaleWithFullMatch>;
    abstract findBySeason(userId, seasonStartYear): Promise<SeasonPass[]>;
    abstract findAll(userId): Promise<SeasonPass[]>;
}
```

This is a pure delegation wrapper (same rationale as PSG-26's D4: `AccountingDb`/`SalesDb`/`SeasonPassesDb` stay the single implementations; nothing is duplicated here), so no interim-shortcut flag is needed.

### `get-season-accounting.usecase.ts` — the moved logic, verbatim

Moves, unchanged in substance:
- The private `getAccounting` helper (today's lines 66–121) → private method `getAccounting` on the usecase, calling `this.db.getAccounting(...)` and `this.db.getOneByWithFullMatch(...)`.
- The body of `getSeason` (today's lines 123–213), redis-cache wrapper included, becomes `execute(userId, dates, seasonStartYear)`.
- Module-level `computeLeadTime`/`leadDays` (today's lines 310–342) → module-scope functions in the usecase file, comments moved verbatim (including the lead-days clamp comment and the season-investment cutoff comment).
- `formatAggregate`, `statusConverter` imports move with the code that uses them.

No ORM import in this file — only `IGetSeasonAccountingUsecaseDb`, `RedisService`, `CACHE_KEYS`, types.

### `AccountingService` becomes a thin delegate for these three methods

```ts
async getCurrentSeason(userId: UserId): Promise<TimePeriodAccounting> {
    const seasonDate = getCurrentSeasonDate();
    const year = seasonStartYearFromDate(seasonDate.start);

    return this.getSeasonAccountingUsecase.execute(userId, seasonDate, year);
}
```

`getGivenSeason` and `getAllTime` follow the same shape — each resolves its own date range/seasonStartYear (genuinely different logic per method) and delegates. `getAllTime` still needs `salesDbService.getOldestMatchSale` directly (unrelated to the usecase's own db surface), so `AccountingService` keeps its `ISalesDbService` dependency. `accountingDbService` and `seasonPassesDbService` also stay on `AccountingService` — required by the untouched `getAmortization`.

### `IAccountingService` loses `getAccounting`

The abstract method is deleted from the interface; `AccountingService` no longer implements it at all (it's fully absorbed into the usecase's private helper). Confirmed safe: `grep -rn "\.getAccounting("` across `src/` shows only `accounting.service.ts` (self) and `accounting.service.spec.ts` as callers.

### Module registration — colocated usecase module, superseding the issue's literal wording (PSG-24/26/27 precedent)

The issue says "register the usecase as a provider in accounting.module.ts". The established, twice-repeated convention (PSG-24 → PSG-26 → PSG-27) is a colocated `<usecase>.usecase.module.ts` that the owning module imports, not an inline provider entry. This design follows that convention:

```ts
// get-season-accounting.usecase.module.ts
@Module({
    imports: [AccountingDbModule, SalesDbModule, SeasonPassesDbModule, RedisModule],
    providers: [
        { provide: IGetSeasonAccountingUsecaseDb, useClass: GetSeasonAccountingUsecaseDb },
        { provide: IGetSeasonAccountingUsecase, useClass: GetSeasonAccountingUsecase },
    ],
    exports: [IGetSeasonAccountingUsecase],
})
export class GetSeasonAccountingUsecaseModule {}
```

`accounting.module.ts` adds `GetSeasonAccountingUsecaseModule` to its `imports` and keeps its own `AccountingDbModule`/`SalesDbModule`/`SeasonPassesDbModule`/`RedisModule` imports (still needed for `AccountingService`'s own remaining dependencies).

### Test strategy

`accounting.service.spec.ts`'s `getAccounting` describes and the `getSeason` + lead-time-aggregation describes move to `get-season-accounting.usecase.spec.ts` (assertions retargeted from `service.getAccounting(...)`/`service.getSeason(...)` to `usecase.execute(...)`/the usecase's own private-call surface, titles unchanged). `getCurrentSeason`/`getGivenSeason`/`getAllTime` stay in `accounting.service.spec.ts`, retargeted to assert delegation to a mocked `IGetSeasonAccountingUsecase` instead of asserting on redis/db calls directly. `getAmortization`'s describes are untouched. A new `get-season-accounting.usecase.db.spec.ts` covers the thin delegation wrapper, same shape as `commit-sales-import.usecase.db.spec.ts`.

## Files affected

### Created
| File | Purpose |
|---|---|
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.ts` | `GetSeasonAccountingUsecase` + `IGetSeasonAccountingUsecase`; owns `execute`, `getAccounting`, `computeLeadTime`/`leadDays` |
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.ts` | `GetSeasonAccountingUsecaseDb` + `IGetSeasonAccountingUsecaseDb`; wraps existing db tokens |
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.module.ts` | Registers both providers, exports the usecase token |
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.spec.ts` | Moved `getAccounting`/`getSeason`/lead-time tests |
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.db.spec.ts` | New delegation tests for the db wrapper |

### Modified
| File | Change |
|---|---|
| `src/api/accounting/accounting.service.ts` | Loses `getAccounting`, `getSeason`'s body, `computeLeadTime`/`leadDays`; `getCurrentSeason`/`getGivenSeason`/`getAllTime` become thin delegates; gains `IGetSeasonAccountingUsecase` dependency |
| `src/api/accounting/interfaces/accounting.service.interface.ts` | Removes `getAccounting` |
| `src/api/accounting/accounting.module.ts` | Imports `GetSeasonAccountingUsecaseModule` |
| `src/api/accounting/accounting.service.spec.ts` | Loses `getAccounting`/`getSeason`/lead-time describes; `getCurrentSeason`/`getGivenSeason`/`getAllTime` retargeted to assert delegation |

### Unchanged
| File | Reason |
|---|---|
| `accounting.controller.ts` | Calls `IAccountingService`, unaffected by the internal split |
| `getAmortization` and its tests | Not part of this issue |
| `src/db/**` | Consumers, not participants — no ORM/db-layer change |
| `web/**` | Backend-only |

## Verification

```bash
npm run lint && npm run typecheck && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```

Load-bearing checks: `src/app.module.spec.ts` (DI graph, catches a missing `imports` entry in the new usecase module); comment sweep (season-investment-cutoff comment and lead-days-clamp comment must reappear verbatim in the usecase file); `grep -rn "\.getAccounting("` outside the usecase folder returns nothing.
