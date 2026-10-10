# PSG-45 sale cache key Implementation Plan

Spec: `docs/specs/2026-10-10-psg-45-sale-cache-key-design.md`. Backend only.
Repo rules: explicit return types, no single-letter vars, braces on every `if`, blank line
before if/for/return/throw, no barrels, no comments unless non-obvious why, branded types,
nested `describe` per condition. Conventional commits (`fix(cache): ...`), stage only, no commit
until user reviews.

## Task 1: CACHE_KEYS.sale takes userId (TDD)

Files: `src/redis/CACHE_KEYS.ts`, `src/redis/CACHE_KEYS.spec.ts`

- [ ] In `CACHE_KEYS.spec.ts` add to `describe('invalidateSales')`:
  `describe('sale key')` with its: starts with `CACHE_KEYS.invalidateSales(userId)` prefix;
  does not start with another user's prefix; differs from `sales`, `salesByMatch`,
  `salesByRange` keys for the same user.
- [ ] Run `npx vitest run src/redis/CACHE_KEYS.spec.ts`, expect fail (typecheck/assert).
- [ ] Change to
  `sale: (userId: UserId, saleId: SaleId): CacheKey<Sale> => \`user:id:${userId}:sales:id:${saleId}\` as CacheKey<Sale>`.
- [ ] Re-run, expect pass.

## Task 2: Update call sites and specs

Pass the user id first. Keep the direct invalidates.

- [ ] `src/db/sales/sales.db.ts`: getOneSale -> `CACHE_KEYS.sale(userId, saleId)`;
  cancelMany -> `CACHE_KEYS.sale(sale.userId as UserId, sale.id as SaleId)` (rename the `s`
  lambda params to explicit names if touched; `userIds` set already exists there).
- [ ] `src/db/sales-import/sales-import.db.ts` deleteBatch -> `CACHE_KEYS.sale(userId, id)`.
- [ ] `ungift-sale.usecase.db.ts:80`, `update-sale.usecase.db.ts:217` (inside
  `invalidateSaleCaches(userId, saleId)`), `delete-sale.usecase.db.ts:52`: `CACHE_KEYS.sale(userId, saleId)`.
- [ ] Update specs: `sales-import.db.spec.ts` (~229-232), `ungift-sale.usecase.db.spec.ts:138`,
  `update-sale.usecase.db.spec.ts` (128, 267, 334), `delete-sale.usecase.db.spec.ts:105`,
  and any `sales.db.spec.ts` assertion on the sale key (grep `CACHE_KEYS.sale` again; also grep `'sale:id'` literals).
- [ ] `npm run typecheck` clean; `npx vitest run src/db src/api/sales src/redis`.

## Task 3: loadMatches invalidates affected users (TDD)

Files: `src/db/matches/matches.db.ts`, `src/db/matches/matches.db.spec.ts`

- [ ] Add failing tests inside `describe('loadMatches')`, one `describe` per condition from
  the spec Testing section (mock `prismaService.sales.findMany` resolving `[{ userId: 'user-1' }, { userId: 'user-2' }]`).
  Assertions: findMany called with `{ where: { matchId: { in: [ids] } }, select: { userId: true }, distinct: ['userId'] }`;
  `invalidatePattern` called with `invalidateSales`/`invalidateAccounting` per user;
  existing "invalidatePattern called once" test must be updated to reflect new calls
  (matches flush is still exactly one call with `invalidateMatches()`).
  Failure cases: lookup rejects while sync failed -> rejects with 'db exploded' not the lookup error;
  lookup rejects while sync succeeded -> rejects with lookup error.
- [ ] Run, expect fail.
- [ ] Implement: add `private readonly logger = new Logger(MatchesDb.name)`; in `loadMatches`:
  ```ts
  let syncFailed = false;
  try { await this.syncMatches(...); }
  catch (error) { syncFailed = true; throw error; }
  finally {
      ...existing invalidations...
      await this.invalidateSalesCachesForMatches(updatedMatchIds, syncFailed);
  }
  ```
  Private `invalidateSalesCachesForMatches(matchIds: MatchId[], swallowErrors: boolean): Promise<void>`:
  early return when empty; try { findMany distinct userId -> map `as UserId`; for each user await both invalidatePatterns }
  catch (error) { if (!swallowErrors) { throw error; } this.logger.error(`sales cache invalidation after failed match sync failed for ${matchIds.length} matches`, error); }.
  Short comment on why swallow (must not mask the sync error). Explicit return types, no single-letter names.
- [ ] Run `npx vitest run src/db/matches`, expect pass.

## Task 4: Verify

- [ ] `npm run typecheck`, `npm run lint`, `npm test` all pass (paste output; do not assume).
- [ ] `grep -rn "sale:id" src e2e web/src shared` shows no remaining producer of the old shape.
- [ ] Stage changes only; tell user to run `/crit`. Move Linear PSG-45 to In Progress when starting, In Review once staged.

## Split

Backend-only; no frontend work (web reads the API response only).
