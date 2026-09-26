# Extract `AccountingService.getAmortization` into its own usecase — Design

**Date:** 2026-09-26
**Status:** Draft
**Issue:** PSG-29
**Type:** Backend-only refactor. Net-zero at runtime. No API, cache-key, or behavior change.

## Problem

`AccountingService.getAmortization` (`src/api/accounting/accounting.service.ts:58`) is an independent computation from the season-accounting flow already extracted in PSG-28 (`GetSeasonAccountingUsecase`). It reads season-pass data and per-match realized profit for a season, then computes cumulative profit per match, break-even detection, and progress/remaining/surplus against the season-pass price. The result is redis-cached. The module-level `emptyAmortization` helper (lines 153–166) is the redis-miss fallback used only by this method.

This extracts `getAmortization` into its own usecase, following the exact pattern PSG-28 established for `get-season-accounting` (itself following PSG-26/PSG-27): a colocated `usecases/<name>/` folder split into `<name>.usecase.ts` (business logic, no ORM import) and `<name>.usecase.db.ts` (the only file in the folder that imports the ORM — indirectly, by wrapping existing db-service interfaces).

## Non-goals

- Changing any API request/response shape, cache key, cache TTL, or computed values. The redis key (`CACHE_KEYS.amortization`), TTL (`ONE_DAY_TTL`), and every formula (progress/remaining/surplus/break-even) move byte-identical.
- Touching `getCurrentSeason`/`getGivenSeason`/`getAllTime` or `GetSeasonAccountingUsecase` — already extracted in PSG-28, untouched here.
- Merging with `GetSeasonAccountingUsecase`. Both read season-pass data, but for different purposes (season-investment totals vs. amortization progress) and via different queries (`findBySeason`/`findAll` vs. `findBySeason` alone plus `getRealizedProfitPerMatch`). They stay two separate usecases.
- Frontend changes. None — backend-only, confirmed by scope (only `src/api/accounting/**` and its module wiring change).

## Design decisions (following the PSG-28 pattern exactly)

### Location and naming

```
src/api/accounting/usecases/get-amortization/
  get-amortization.usecase.ts        # GetAmortizationUsecase + IGetAmortizationUsecase
  get-amortization.usecase.db.ts     # GetAmortizationUsecaseDb + IGetAmortizationUsecaseDb
  get-amortization.usecase.module.ts # GetAmortizationUsecaseModule
  get-amortization.usecase.spec.ts
  get-amortization.usecase.db.spec.ts
```

### `get-amortization.usecase.db.ts` — narrow wrapper over existing db tokens, not new Prisma access

Same shape as `GetSeasonAccountingUsecaseDb`: depends on the existing `ISeasonPassesDbService` and `IAccountingDbService` tokens, exposing only the two methods this usecase calls — never Prisma directly, never the modules' full interfaces:

```ts
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
```

No `SalesDbModule` import — amortization never touches sales data directly, only accounting/season-passes. This is a pure delegation wrapper (`SeasonPassesDb`/`AccountingDb` stay the single implementations; nothing duplicated here), so no interim-shortcut flag is needed.

### `get-amortization.usecase.ts` — the moved logic, verbatim

Moves, unchanged in substance, from today's `getAmortization` (lines 58–150) and `emptyAmortization` (lines 153–166):
- The full redis-cache wrapper (`this.redisService.get(CACHE_KEYS.amortization(...), ONE_DAY_TTL, async () => {...})`) becomes the body of `execute(userId, seasonStartYear)`.
- `getSeasonWindow(seasonStartYear, 'inclusive')` call, the parallel `findBySeason`/`getRealizedProfitPerMatch` fetch, the cumulative-profit reduction loop with break-even detection, and the `Amortization` object construction — all byte-identical.
- Module-level `emptyAmortization` moves to the usecase file as a module-scope function, used as the `?? emptyAmortization(seasonStartYear)` fallback exactly as today.

No ORM import in this file — only `IGetAmortizationUsecaseDb`, `RedisService`, `CACHE_KEYS`, `ONE_DAY_TTL`, `getSeasonWindow`, and the `Amortization`/`AmortizationMatchRow` types.

```ts
export abstract class IGetAmortizationUsecase {
    abstract execute(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<Amortization>;
}
```

### `AccountingService.getAmortization` becomes a one-line delegate

```ts
async getAmortization(
    userId: UserId,
    seasonStartYear: SeasonYear,
): Promise<Amortization> {
    return this.getAmortizationUsecase.execute(userId, seasonStartYear);
}
```

`AccountingService` gains a new `IGetAmortizationUsecase` constructor dependency. It **keeps** `accountingDbService` and `seasonPassesDbService` — both are still required by `getAllTime` (`salesDbService.getOldestMatchSale`) and by `GetSeasonAccountingUsecase`'s own dependents are already satisfied via its own module; `AccountingService` itself has no other caller of `accountingDbService`/`seasonPassesDbService` once this extraction lands, so those two fields become unused on `AccountingService` and are removed from its constructor. `redisService` also becomes unused on `AccountingService` and is removed — `getAmortization` was its only caller (confirmed: `getCurrentSeason`/`getGivenSeason`/`getAllTime` already delegate to `GetSeasonAccountingUsecase`, which owns its own `RedisService`).

`IAccountingService` is unchanged — `getAmortization`'s signature doesn't change, only its implementation.

### Module registration — colocated usecase module (PSG-24/26/27/28 precedent)

```ts
// get-amortization.usecase.module.ts
@Module({
    imports: [AccountingDbModule, SeasonPassesDbModule, RedisModule],
    providers: [
        { provide: IGetAmortizationUsecaseDb, useClass: GetAmortizationUsecaseDb },
        { provide: IGetAmortizationUsecase, useClass: GetAmortizationUsecase },
    ],
    exports: [IGetAmortizationUsecase],
})
export class GetAmortizationUsecaseModule {}
```

`accounting.module.ts` adds `GetAmortizationUsecaseModule` to its `imports` alongside the existing `GetSeasonAccountingUsecaseModule`. Because `AccountingService` no longer uses `AccountingDbModule`/`SeasonPassesDbModule`/`RedisModule` directly (see above — those dependencies move into the two usecase modules), `accounting.module.ts` drops its own direct imports of `AccountingDbModule`, `SeasonPassesDbModule`, and `RedisModule`, keeping only `SalesDbModule` (still needed by `AccountingService.getAllTime`), `GetSeasonAccountingUsecaseModule`, and the new `GetAmortizationUsecaseModule`.

### Test strategy

`accounting.service.spec.ts`'s `getAmortization` describe block (all 7 `it`s covering zeroed result, progress without break-even, break-even flagging, progress-capped/surplus overshoot, missing-pass surplus, cache-hit read, and cache delegation with correct key/ttl) moves to `get-amortization.usecase.spec.ts`, retargeted from `service.getAmortization(...)` to `usecase.execute(...)` and from `seasonPassesDbService`/`accountingDbService`/`redisService` mocks to a mocked `IGetAmortizationUsecaseDb` + `RedisService`. `accounting.service.spec.ts` keeps a much smaller `getAmortization` describe that only asserts delegation to a mocked `IGetAmortizationUsecase`. A new `get-amortization.usecase.db.spec.ts` covers the two-method delegation wrapper, same shape as `get-season-accounting.usecase.db.spec.ts`.

## Files affected

### Created
| File | Purpose |
|---|---|
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.ts` | `GetAmortizationUsecase` + `IGetAmortizationUsecase`; owns `execute`, module-scope `emptyAmortization` |
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.ts` | `GetAmortizationUsecaseDb` + `IGetAmortizationUsecaseDb`; wraps `ISeasonPassesDbService.findBySeason` + `IAccountingDbService.getRealizedProfitPerMatch` |
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.module.ts` | Registers both providers, exports the usecase token |
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts` | Moved `getAmortization` tests, retargeted to `execute()` |
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.db.spec.ts` | New delegation tests for the db wrapper |

### Modified
| File | Change |
|---|---|
| `src/api/accounting/accounting.service.ts` | `getAmortization` becomes a one-line delegate; loses `emptyAmortization`; constructor drops `accountingDbService`, `seasonPassesDbService`, `redisService` (all become unused); gains `IGetAmortizationUsecase` dependency |
| `src/api/accounting/accounting.module.ts` | Imports `GetAmortizationUsecaseModule`; drops direct `AccountingDbModule`/`SeasonPassesDbModule`/`RedisModule` imports (moved into the two usecase modules); keeps `SalesDbModule` |
| `src/api/accounting/accounting.service.spec.ts` | `getAmortization` describe shrinks to a delegation assertion against a mocked `IGetAmortizationUsecase`; drops now-unused `IAccountingDbService`/`ISeasonPassesDbService`/`RedisService` providers from its test module if nothing else in the spec needs them |

### Unchanged
| File | Reason |
|---|---|
| `accounting.controller.ts` | Calls `IAccountingService`, unaffected by the internal split |
| `interfaces/accounting.service.interface.ts` | `getAmortization`'s signature is unchanged |
| `GetSeasonAccountingUsecase` and its module/spec | Not part of this issue |
| `src/db/**` | Consumers, not participants — no ORM/db-layer change |
| `web/**` | Backend-only |

## Verification

```bash
npm run lint && npm run typecheck && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```

Load-bearing checks: `src/app.module.spec.ts` (DI graph, catches a missing `imports` entry in the new usecase module or a dangling unused-import in `accounting.module.ts`); `grep -rn "\.getAmortization(" src/` outside the usecase folder returns only `accounting.service.ts` (the delegate) and `accounting.controller.ts`; `AccountingService`'s constructor after the change has exactly two dependencies (`ISalesDbService`, `IGetSeasonAccountingUsecase`... plus the new `IGetAmortizationUsecase`) — no unused-import/unused-constructor-param lint errors.
