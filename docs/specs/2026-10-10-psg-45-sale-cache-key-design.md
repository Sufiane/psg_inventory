# PSG-45: stale match date in sale edit form after football-data pull

## Problem

Correcting a match kickoff via `POST /admin/matches/load/...` leaves the sale edit form
showing the old match date. The sale detail (`getOneSale`) is cached for 1h under
`sale:id:<saleId>` and embeds `Match.date`. `loadMatches` only invalidates `matches:*`
and `match:id:*` keys. The admin `flushUserCache` invalidates `user:id:<userId>:sales*`,
which does not match `sale:id:*` either.

## Design (approved)

### 1. Re-home the sale key under the user's sales namespace

`CACHE_KEYS.sale(userId, saleId)` returns `user:id:${userId}:sales:id:${saleId}`.
The existing `invalidateSales(userId)` pattern (`user:id:${userId}:sales*`) now covers it,
so admin flush, `cancelMany`, `deleteBatch`, and every sale write already clear it.

- Collision check: sibling shapes are `...:sales`, `...:sales:match:<id>`,
  `...:sales:start:<iso>:end:<iso>`. The new `...:sales:id:<id>` segment is distinct.
- Keep the explicit single-key `invalidate(CACHE_KEYS.sale(...))` calls (cheap fast path,
  no SCAN). They now need `userId`; all call sites have it in scope.
- Old-shape `sale:id:*` keys are never read or written again and expire within 1h.
  No migration step. During a rolling deploy an old pod may still serve/write old keys:
  bounded by the 1h TTL (same trade-off accepted in the 2026-09-15 spec).
- Side benefit: the old key was not user-scoped, so a cache hit skipped the `userId`
  filter in `getOneSale`'s query. The new key is user-scoped.

Call sites: `src/db/sales/sales.db.ts` (getOneSale, cancelMany),
`src/db/sales-import/sales-import.db.ts` (deleteBatch),
`src/api/sales/usecases/{ungift-sale,update-sale,delete-sale}/*.usecase.db.ts`, plus their
specs. No `sale:id` reference in `e2e/`, `web/`, or `shared/` (verified by grep).

### 2. Invalidate affected users' sales caches in `loadMatches`

After `syncMatches`, inside the existing `finally` (so matches committed before a mid-loop
throw are still covered): if `updatedMatchIds` is non-empty, query
`prisma.sales.findMany({ where: { matchId: { in: ids } }, select: { userId: true }, distinct: ['userId'] })`,
then per distinct user call `invalidatePattern(invalidateSales(userId))` and
`invalidatePattern(invalidateAccounting(userId))`. Accounting is included because
accounting/amortization are bucketed by match date. The query lives in `matches.db.ts`
(already the ORM boundary); it is a private method, not added to `IMatchesDbService`.
Userids branded at the db boundary (`as UserId`).

Only matches that already existed (`updatedMatchIds`) are considered; newly created
matches cannot have sales.

### 3. Failure safety inside `finally`

A throw from the lookup inside `finally` would replace the sync error. Decision:
- Track whether the sync failed (`syncFailed` flag set in a `catch` that rethrows).
- Run the new step last in `finally`, after the existing matches/per-match invalidations.
- Wrap the lookup + per-user invalidation in try/catch. If the sync failed, log
  (`Logger.error`, ids in the message) and swallow so the original error propagates.
  If the sync succeeded, rethrow so the admin sees the failure and can re-run the pull
  (re-run is idempotent) rather than silently leaving stale caches for up to 1h.
- Per-user invalidations use `Promise.allSettled`-free sequential awaits inside the same
  try; a single failing user aborts the rest. Accepted: same fail-fast shape as the
  existing loop, and re-run recovers.

Pre-existing: the earlier redis calls in `finally` can also mask the original error.
Out of scope; noted for `docs/tech-debt.md` if the user wants it.

## Testing

- `CACHE_KEYS.spec.ts`: sale key starts with the `invalidateSales` prefix of the same user;
  not matched by another user's prefix; distinct from `sales`, `salesByMatch`,
  `salesByRange` keys.
- `matches.db.spec.ts` (nested `describe` per condition):
  - when updated matches have sales owned by several users: one sales + one accounting
    invalidation per distinct user, lookup filtered by updated match ids, `distinct` userId.
  - when no match was updated (only creates/unknown competition): no sales query.
  - when updated matches have no sales: no per-user invalidation.
  - when a mid-loop transaction throws: committed matches' users still invalidated, original error propagates.
  - when the lookup throws and sync failed: original error propagates, error logged.
  - when the lookup throws and sync succeeded: lookup error propagates.
- Updated specs for the 5 call-site specs use the new signature.

## Risks

- Every pull re-updates every existing fixture, so every user with any sale gets two
  SCAN-based flushes (full-keyspace walks) per pull. Fine at current user count; if it
  grows, restrict to matches whose date actually changed (needs selecting the old date in
  `syncMatches` and a separate id list). Not in scope.
- Rolling-deploy old-key window bounded by TTL.
- Typecheck breaks until all call sites are updated (signature change is the safety net).
