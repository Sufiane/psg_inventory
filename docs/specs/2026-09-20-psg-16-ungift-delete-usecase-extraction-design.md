# Extract `ungiftSale` and `deleteSale` into dedicated usecases — Design

**Date:** 2026-09-20
**Status:** Draft
**Issue:** PSG-16
**Type:** Backend-only refactor. Net-zero at runtime.
**Depends on:** The `db-module-split-and-db-rename` refactor (2026-09-16), which split `DbModule` into per-service modules, renamed db files to `*.db.ts`, and exempted `*.usecase.db.ts` from the `no-orm-outside-db` rule.

## Problem

`SalesService` (`src/api/sales/sales.service.ts`) has grown into a 398-line file that mixes read orchestration, five write intents, recipient resolution, transition legality checks, and cache invalidation. The `2026-09-15-remove-gifted-backcompat-design` spec explicitly noted this:

> `src/api/sales/sales.service.ts` is doing a lot: routing three write intents,
> resolving recipients, and guarding transitions. The project convention would extract
> `updateSale` into a usecase (`sales/usecases/update-sale/`). That is a real
> refactor with its own tests, not a deletion, and mixing it into this change would
> bury what is being removed. Left for a follow-up.

Two of `SalesService`'s five write methods — `ungiftSale` and `deleteSale` — are the lowest-risk candidates for a first extraction:

- **`ungiftSale`** (lines 269–283): the sanctioned manual repair for a mistaken gift (spec D16). Called only by `scripts/ungift-sale.ts`, deliberately not wired to any controller.
- **`deleteSale`** (lines 285–300): deletes a sale and its cascade. Called by `SalesController.deleteSale`.

Both follow the same pattern: load sale → validate → call a single `SalesDb` method → invalidate caches. Both are small, self-contained, and have thorough test coverage.

Extracting both at once lets the db-layer private helpers they depend on (`loadSaleRowOrThrow`, `invalidateSaleCaches`) move as one unit, and establishes the usecase convention while the blast radius is small.

### Why now, not later

The `db-module-split-and-db-rename` refactor (2026-09-16) was designed to **unblock** colocated usecase files. Specifically:

> **Unblocks (not implemented here):** colocated `*.usecase.db.ts` files under
> `src/api/`, per the usecase-layer convention in the user's global CLAUDE.md.

And its dependency-cruiser config already exempts `*.usecase.db.ts` from `no-orm-outside-db`:

```js
pathNot: ['^src/db/', '\\.db\\.ts$', '\\.spec\\.ts$'],
```

The infrastructure is in place. Extracting these two methods now is the first step toward the fuller `updateSale` extraction that the backcompat spec deferred.

## Non-goals

- Extracting `updateSale`. That involves three routing branches (`giftSale`, `updateGift`, `updateSale`), recipient resolution, and transition legality — a substantially larger usecase. This extraction establishes the pattern; `updateSale` follows.
- Extracting `addSale` or `getSale`/`getSales`. Read-path methods and the add flow are not in scope.
- Changing the API response shape, cache keys, or any runtime behavior.
- Frontend changes.

## Design decisions

### D1 — Usecases live under `src/api/sales/usecases/`

Each usecase gets its own directory:

```
src/api/sales/usecases/
  ungift-sale/
    ungift-sale.usecase.ts      # business logic (validation + orchestration)
    ungift-sale.usecase.db.ts   # db-layer helpers (load, mutate, invalidate)
    ungift-sale.usecase.db.spec.ts
  delete-sale/
    delete-sale.usecase.ts
    delete-sale.usecase.db.ts
    delete-sale.usecase.db.spec.ts
```

The naming convention follows the existing project patterns:
- `*.usecase.ts` for the orchestration layer (parallel to `*.service.ts`)
- `*.usecase.db.ts` for the colocated db layer (parallel to `*.db.ts`)
- `*.usecase.db.spec.ts` for the db-layer tests (parallel to `*.db.spec.ts`)

The `usecases/` directory sits inside the api module (`src/api/sales/usecases/`), not inside the db directory (`src/db/sales/usecases/`). This matches the `2026-09-15-remove-gifted-backcompat-design` reference to `sales/usecases/update-sale/` and the dependency-cruiser config that already handles `*.usecase.db.ts` anywhere in the tree.

### D2 — Each usecase owns the full pipeline: load → validate → mutate → invalidate

A usecase does everything its extracted method did. For `ungiftSale`:

```ts
// ungift-sale.usecase.ts
async execute(userId: UserId, saleId: SaleId): Promise<void> {
    const existing = await this.usecaseDb.loadSale(userId, saleId);

    if (!existing) {
        throw new DomainException(ErrorCode.SALE_NOT_FOUND);
    }

    if (existing.status !== 'GIFTED') {
        throw new DomainException(ErrorCode.SALE_INVALID_STATUS_TRANSITION);
    }

    await this.usecaseDb.ungiftSale(userId, saleId);
}
```

```ts
// ungift-sale.usecase.db.ts
async loadSale(userId: UserId, saleId: SaleId): Promise<Sale | null> {
    return this.salesDbService.getOneSale(userId, saleId);
}

async ungiftSale(userId: UserId, saleId: SaleId): Promise<void> {
    await this.salesDbService.ungiftSale(userId, saleId);
    await this.invalidateAfterWrite(userId, { recipientChanged: true });
}
```

The usecase's db layer re-injects `ISalesDbService` (for the actual data operations) and `RedisService` (for cache invalidation). It wraps the raw db calls with the cache invalidation that currently lives on `SalesService`.

**Cache invalidation lives in the usecase db layer**, not on `SalesService`. Rationale:

1. `invalidateAfterWrite` is a write-path concern. Reads never call it.
2. Moving cache invalidation into the usecase db layer makes each usecase self-contained: calling one method does the mutation *and* the cache cleanup.
3. The remaining callers of `invalidateAfterWrite` on `SalesService` (`updateSale`'s three branches) are unchanged by this extraction. The method stays on `SalesService` for them. When `updateSale` is extracted into its own usecase later, the method can be removed from `SalesService`.
4. The usecase db layer's cache invalidation is specific to that operation — it doesn't need the generic `invalidateAfterWrite` helper. It calls `redisService.invalidatePattern` directly with the correct keys.

### D3 — Usecases are injected into `SalesService`, not called by the controller directly

The controller continues to call `SalesService`, which delegates to the usecase:

```ts
// SalesService
constructor(
    // ...existing deps...
    private readonly ungiftSaleUsecase: UngiftSaleUsecase,
    private readonly deleteSaleUsecase: DeleteSaleUsecase,
) {}

async ungiftSale(userId: UserId, saleId: SaleId): Promise<void> {
    return this.ungiftSaleUsecase.execute(userId, saleId);
}

async deleteSale(userId: UserId, saleId: SaleId): Promise<void> {
    return this.deleteSaleUsecase.execute(userId, saleId);
}
```

Rationale:

- **Controller stays thin.** `SalesController` already delegates everything to `ISalesService`. Changing it to call usecases directly would mean two injection patterns in one controller — service for reads, usecase for writes — which is harder to read than a single delegation.
- **`scripts/ungift-sale.ts` already calls `ISalesService`.** It resolves `ISalesService` from the Nest container. Injecting a usecase token there would require either (a) importing the usecase token directly into the script, or (b) keeping the service delegation. Keeping the delegation is simpler and keeps the script's contract unchanged.
- **The service becomes a thin facade over usecases + read methods.** This is the natural progression: as more methods are extracted, `SalesService` shrinks to reads + delegation. The controller never changes.

### D4 — The usecase db layer wraps `ISalesDbService`, it doesn't replace it

`ISalesDbService` stays as-is. The usecase db layer injects it and calls its methods. The private helpers that the issue mentions (`applySaleWrite`, `loadSaleRowOrThrow`, `invalidateSaleCaches`) do **not** move in this change — they remain on `SalesDb` because they are used by the un-extracted methods (`updateSale`, `giftSale`, `updateGift`). They will move when those methods are extracted.

What does move: the cache-invalidation-after-write pattern. Currently on `SalesService.invalidateAfterWrite`, it becomes the usecase db layer's responsibility for these two operations. This is a **duplication** of the pattern (each usecase db file calls `redisService.invalidatePattern`), but the duplicated calls are small (2-3 lines) and specific to each operation, making them clearer than a shared helper that takes a `recipientChanged` boolean.

### D5 — Abstract tokens for the usecases

Each usecase gets its own abstract token:

```ts
// ungift-sale.usecase.ts
export abstract class IUngiftSaleUsecase {
    abstract execute(userId: UserId, saleId: SaleId): Promise<void>;
}

// delete-sale.usecase.ts
export abstract class IDeleteSaleUsecase {
    abstract execute(userId: UserId, saleId: SaleId): Promise<void>;
}
```

The module wires them:

```ts
// sales.module.ts
@Module({
    imports: [/*...existing...*/],
    controllers: [SalesController],
    providers: [
        { provide: ISalesService, useClass: SalesService },
        { provide: IUngiftSaleUsecase, useClass: UngiftSaleUsecase },
        { provide: IDeleteSaleUsecase, useClass: DeleteSaleUsecase },
    ],
})
```

Rationale: the project already uses abstract tokens for every service (`ISalesDbService`, `ISalesService`, etc.). The usecases follow the same pattern. This enables clean mocking in tests and keeps the DI graph explicit.

### D6 — `SalesService` loses its direct `RedisService` dependency for these two paths

After extraction, `SalesService.ungiftSale` and `SalesService.deleteSale` are one-line delegations. The cache invalidation that was on `invalidateAfterWrite` for these paths now lives in the usecase db layer.

`SalesService` still needs `RedisService` for the `updateSale` branches (lines 158, 170, 182). That dependency stays until `updateSale` is extracted. The constructor signature of `SalesService` is unchanged.

### D7 — Test strategy

**New test files:**

| File | What it tests |
|---|---|
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts` | Business logic: loads sale, validates existence, validates GIFTED status, delegates to usecase db, throws correct errors |
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts` | Db layer: calls `salesDbService.ungiftSale`, invalidates accounting and recipients caches |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.spec.ts` | Business logic: loads sale, validates existence, delegates to usecase db, throws correct errors |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.db.spec.ts` | Db layer: calls `salesDbService.deleteSale`, invalidates accounting cache always, invalidates recipients cache only for GIFTED |

**Modified test files:**

| File | Change |
|---|---|
| `src/api/sales/sales.service.spec.ts` | Remove the `ungiftSale` and `deleteSale` describe blocks (lines 914–956, 1083–1166). Add thin delegation tests that verify `SalesService.ungiftSale` calls `UngiftSaleUsecase.execute` and `SalesService.deleteSale` calls `DeleteSaleUsecase.execute`. |

**Test counts (approximate):**

- `ungiftSale` usecase spec: 3 tests (GIFTED sale → delegates, non-GIFTED → throws, nonexistent → throws)
- `ungiftSale` usecase db spec: 2 tests (calls db method, invalidates caches)
- `deleteSale` usecase spec: 2 tests (existent sale → delegates, nonexistent → throws)
- `deleteSale` usecase db spec: 4 tests (calls db method, always invalidates accounting, GIFTED invalidates recipients, non-GIFTED doesn't)
- `sales.service.spec.ts` delegation: 2 tests (one per method)

Total: 13 tests, covering the same scenarios as the current 9 tests plus delegation tests.

### D8 — The `ISalesDbService` interface is unchanged

The db-layer methods `ungiftSale(userId, saleId)` and `deleteSale(userId, saleId)` stay on `ISalesDbService` and `SalesDb`. The usecase db layer wraps them. This is deliberate: changing the interface would ripple into the module wiring and is not needed for this extraction.

### D9 — `SalesDb` private helpers do not move yet

`loadSaleRowOrThrow` and `invalidateSaleCaches` are private methods on `SalesDb` used by `updateSale`, `giftSale`, `updateGift`, `ungiftSale`, and `deleteSale`. Moving them would require updating all five callers. Since only two methods are being extracted, moving the helpers now would create a half-moved state.

When `updateSale` is extracted, all five callers will have moved, and the private helpers can be promoted to non-private or extracted as shared utilities in that later change.

`applySaleWrite` is used only by `updateSale`, `giftSale`, and `updateGift` — none of which are extracted here. It stays put.

### D10 — `scripts/ungift-sale.ts` is unchanged

The script resolves `ISalesService` from the Nest container and calls `salesService.ungiftSale(userId, saleId)`. That call now delegates to the usecase, but the script's code is identical. No change needed.

## Files affected

### Created

| File | Purpose |
|---|---|
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.ts` | `UngiftSaleUsecase` class + `IUngiftSaleUsecase` token |
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.ts` | `UngiftSaleUsecaseDb` class + `IUngiftSaleUsecaseDb` token |
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts` | Business logic tests |
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts` | Db-layer tests |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.ts` | `DeleteSaleUsecase` class + `IDeleteSaleUsecase` token |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.db.ts` | `DeleteSaleUsecaseDb` class + `IDeleteSaleUsecaseDb` token |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.spec.ts` | Business logic tests |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.db.spec.ts` | Db-layer tests |

### Modified

| File | Change |
|---|---|
| `src/api/sales/sales.service.ts` | Remove `ungiftSale` and `deleteSale` method bodies; replace with delegation to usecases. Add usecase tokens to constructor. |
| `src/api/sales/sales.service.spec.ts` | Remove `ungiftSale` and `deleteSale` describe blocks. Add thin delegation tests. |
| `src/api/sales/sales.module.ts` | Add usecase tokens and classes to `providers`. |
| `src/api/sales/interfaces/sales.service.interface.ts` | No change — the abstract methods stay on `ISalesService`. |

### Unchanged

| File | Reason |
|---|---|
| `src/db/sales/sales.db.ts` | Db-layer methods stay; usecase db layer wraps them |
| `src/db/sales/sales.db.interface.ts` | Interface unchanged |
| `src/db/sales/sales.db.module.ts` | No new exports needed |
| `scripts/ungift-sale.ts` | Calls `ISalesService`, which delegates transparently |
| `src/api/sales/sales.controller.ts` | Calls `ISalesService`, unchanged |
| `.dependency-cruiser.cjs` | Already exempts `*.usecase.db.ts` |

## Data flow (post-extraction)

### `ungiftSale`

```
scripts/ungift-sale.ts
  → ISalesService.ungiftSale(userId, saleId)
    → UngiftSaleUsecase.execute(userId, saleId)
      → IUngiftSaleUsecaseDb.loadSale(userId, saleId)          [read]
      → validation (exists? GIFTED?)
      → IUngiftSaleUsecaseDb.ungiftSale(userId, saleId)
        → ISalesDbService.getOneSale(userId, saleId)            [load for db write]
        → ISalesDbService.ungiftSale(userId, saleId)            [mutate]
        → redisService.invalidatePattern(invalidateAccounting)  [cache]
        → redisService.invalidatePattern(invalidateRecipients)  [cache]
```

### `deleteSale`

```
SalesController.deleteSale(user.id, saleId)
  → ISalesService.deleteSale(userId, saleId)
    → DeleteSaleUsecase.execute(userId, saleId)
      → IDeleteSaleUsecaseDb.loadSale(userId, saleId)           [read]
      → validation (exists?)
      → IDeleteSaleUsecaseDb.deleteSale(userId, saleId)
        → ISalesDbService.deleteSale(userId, saleId)            [mutate]
        → redisService.invalidatePattern(invalidateAccounting)  [cache]
        → if GIFTED: redisService.invalidatePattern(invalidateRecipients)  [cache]
```

## Verification

Every phase runs the same gate:

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```

The `test -f dist/main.js` line is load-bearing — see `2026-09-16-db-module-split-and-db-rename-design` D8 for why.

No tsconfig changes. No migration. No runtime behavior change.
