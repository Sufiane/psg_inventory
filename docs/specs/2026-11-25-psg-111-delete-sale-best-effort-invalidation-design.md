# PSG-111: delete-sale cache invalidation best-effort

## Problem

`DeleteSaleUsecaseDb.deleteSale` commits the delete transaction, then awaits four
Redis calls inline. If Redis throws after commit, the request returns 500 for a sale
that is already gone. A client retry then gets `sale_not_found`. PSG-110 (commit
90196f7) fixed the same failure mode for create, update and un-gift by routing
invalidation through `SalesCacheInvalidator.afterWrite`, which logs and swallows. Delete
is the last inline caller.

## Design

No change to `SalesCacheInvalidator`. `afterWrite(userId, saleId, { recipientChanged })`
already covers the four namespaces delete invalidates (sales pattern, sale key,
accounting pattern, recipients pattern when flagged).

- `DeleteSaleUsecaseDb`: drop `RedisService`, `CACHE_KEYS` and the invalidation block.
  `deleteSale(userId, saleId)` only runs the transaction. The `saleStatus` parameter
  goes away, since only the invalidation used it.
- `DeleteSaleUsecase`: inject `SalesCacheInvalidator`. After `deleteSale` resolves, call
  `afterWrite(userId, saleId, { recipientChanged: existing.status === SaleStatus.GIFTED })`.
  A gifted sale's gift row is destroyed, so `giftCount` moves. Any other status leaves
  the recipients cache alone, same as today.
- `DeleteSaleUsecaseModule`: add `SalesCacheInvalidator` to providers (same as
  `UngiftSaleUsecaseModule`); `RedisModule` import stays because the invalidator needs
  `RedisService`.

Ordering is unchanged: invalidation runs only after the transaction commits. If the
transaction throws, the usecase never reaches `afterWrite`.

## Behaviour after the change

| Case | Result |
|---|---|
| Sale missing | `SALE_NOT_FOUND`, no invalidation (unchanged) |
| Delete commits, Redis healthy | all four namespaces invalidated as before |
| Delete commits, Redis throws | 2xx, warning logged per failed namespace, TTL bounds staleness |
| Transaction throws | error propagates, no invalidation |
| GIFTED sale | recipients cache also invalidated |

## Decisions

1. Usecase decides `recipientChanged` (not the db), matching un-gift, which passes
   `true` from the usecase. Costs a value import of the `SaleStatus` enum from
   `@prisma/client` in the usecase. This is an enum constant, not the ORM client, and
   un-gift's spec and other usecases already use it. Alternative: a local
   `status === 'GIFTED'` string compare, rejected as stringly-typed.
2. Drop the `saleStatus` param from the db signature rather than keep it unused.
3. Behaviour change is intended: delete now swallows Redis failures. No API contract
   change.

## Out of scope

- Renaming `afterWrite` or adding a delete-specific method (YAGNI).
- Any change to TTLs or key builders.
- Making `loadSale` and `deleteSale` atomic (TOCTOU between them is pre-existing;
  the delete transaction's `sales.delete` throws if the row vanished).

## Testing

- `delete-sale.usecase.spec.ts`: mock the invalidator. Assert `afterWrite` is called with
  `recipientChanged: true` for GIFTED, `false` otherwise, and not called when the sale is
  missing or `deleteSale` rejects.
- `delete-sale.usecase.db.spec.ts`: remove `RedisService` provider and the four
  invalidation tests; update `deleteSale` calls to the two-arg signature.
- `sales-cache.invalidator.spec.ts` already covers swallow-and-log; no change.
