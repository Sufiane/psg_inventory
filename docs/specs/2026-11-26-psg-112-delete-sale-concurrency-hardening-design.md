# PSG-112: delete-sale concurrency hardening

## Problem

Three gaps in `DeleteSaleUsecase` / `DeleteSaleUsecaseDb`, left after PSG-111:

1. **Double delete returns 500.** Two concurrent deletes both pass `loadSale`. The
   second `tx.sales.delete` throws Prisma `P2025`, which nothing maps, so it surfaces
   as a 500 instead of `sale_not_found`.
2. **Stale recipients cache after a race.** `recipientChanged` uses the status from
   `loadSale`, read before the transaction. If a concurrent PATCH gifts the sale in
   between, the gift row is still destroyed (explicit `deleteMany`, or `ON DELETE
   CASCADE` on `Gifts.Sale`), but `recipientChanged` is `false`, so the recipients
   cache stays stale until TTL.
3. **No log on not-found.** `SALE_NOT_FOUND` is thrown without a `warn` carrying
   `userId` and `saleId`.

## Design

### Db (`delete-sale.usecase.db.ts`)

- `deleteSale(userId, saleId): Promise<{ id: string } | null>`.
  - `tx.sales.delete` gets `select: { id: true }`. The transaction returns that row.
  - `P2025` is caught, logged as `warn` with `code`/`message`/`meta` (same as
    `UngiftSaleUsecaseDb.ungiftSale`), and returned as `null`. Any other error is
    rethrown.
- `loadSale` narrows to `select: { id: true }` and returns `{ id: string } | null`.
  It stays only as the ownership/existence guard. Its status is no longer used.

### Usecase (`delete-sale.usecase.ts`)

- Adds `private readonly logger = new Logger(DeleteSaleUsecase.name)`.
- Both not-found paths (`loadSale` null, `deleteSale` null) go through one private
  `throwNotFound(userId, saleId): never`. It logs
  `warn("Sale ${saleId} not found for user ${userId}")` and then throws
  `DomainException(ErrorCode.SALE_NOT_FOUND)`.
- `recipientChanged: true` on every successful delete. No status is read anymore.

## Behaviour after the change

| Case | Result |
|---|---|
| Sale missing at `loadSale` | 404 `sale_not_found`, warn logged, no invalidation |
| Sale vanishes before `sales.delete` (double delete) | tx rolled back, 404 `sale_not_found`, P2025 warn (db) and not-found warn (usecase), no invalidation |
| Successful delete (any status, incl. gifted by a concurrent PATCH) | recipients cache invalidated |
| Other db error | propagates, no invalidation (unchanged) |

## Decisions

1. **Always invalidate the recipients cache on delete (decided with user, 2026-11-26).**
   Any status read in the app (pre-tx `loadSale`, in-tx `findUnique`,
   `gifts.deleteMany().count`) can miss a concurrent gift PATCH: the gift can still be
   destroyed by `ON DELETE CASCADE` once the PATCH commits. Taking the status from
   `sales.delete({ select })` is only race-free if Prisma issues a single
   `DELETE … RETURNING`, which is unverified for 6.0.1. Deletes are rare, so an
   unconditional recipients flush is cheap and trivially correct.
2. **Keep `loadSale`.** `deleteSale`'s `deleteMany` calls filter by `saleId` only. If
   ownership were checked only by `sales.delete`'s `userId` filter, safety for another
   user's sale id would depend on the rollback. Keeping the pre-check is cheaper than
   reasoning about that.
3. **Log in both layers.** The db logs the raw P2025 for diagnosis, as update-sale and
   ungift-sale already do. The usecase logs the human-readable not-found with ids, which
   those siblings still lack (PSG-113).
4. **Add an int-spec.** `delete-sale.usecase.db.int-spec.ts` checks two things against
   real Postgres and Prisma 6.0.1. Deleting an already-deleted sale returns `null`,
   which pins the P2025 mapping to real engine behaviour rather than a hand-built
   error. Deleting an existing sale returns its id. It reuses
   `real-db.fixtures.ts`, so it costs little. The race itself is not tested at the
   integration level, because it is too timing-dependent to be a reliable test.
5. **No tech-debt entry to touch.** `docs/tech-debt.md` has nothing on delete-sale.
   The TOCTOU that PSG-111 listed under "out of scope" is the one this ticket closes.

## Out of scope

- Adding not-found warns to update-sale and ungift-sale, which have the same gap.
  Filed as PSG-113.
- Dropping the redundant `gifts.deleteMany` given the cascade.

## Testing

- `delete-sale.usecase.db.spec.ts`
  - `loadSale` uses the new select.
  - `deleteSale` returns the deleted id.
  - When `sales.delete` rejects with P2025: returns `null` and warns.
  - When it rejects with another error: rethrows.
- `delete-sale.usecase.spec.ts`
  - A successful delete invalidates with `recipientChanged: true`.
  - When `deleteSale` returns `null`: rejects with `SALE_NOT_FOUND`, does not
    invalidate, and warns with both ids.
  - The missing-at-load case also warns.
- `delete-sale.usecase.db.int-spec.ts`: see decision 4.
