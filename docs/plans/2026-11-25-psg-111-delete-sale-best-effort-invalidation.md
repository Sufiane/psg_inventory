# PSG-111 delete-sale best-effort invalidation Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** a Redis failure after the delete commits is logged and swallowed, not a 500.

**Spec:** `docs/specs/2026-11-25-psg-111-delete-sale-best-effort-invalidation-design.md`

**Size:** about 60 lines changed (about 25 added, about 55 removed incl. tests). One PR,
backend only, one actor, one layer. No ticket split.

**Commit:** `fix(sales): make delete-sale cache invalidation best-effort` (conventional
commit, no PR-number refs, end with the attribution line from the session reminder).
Stage only; user runs `/crit` before commit.

All paths are under `src/api/sales/usecases/delete-sale/`. Code style: explicit return
types, readonly constructor params, blank line before `if`/`return`, no comments, nested
`describe` per condition.

## Task 1: usecase calls the invalidator (TDD)

**Files:** `delete-sale.usecase.spec.ts`, `delete-sale.usecase.ts`

- [ ] Update the spec: add `SalesCacheInvalidator` as a `mockDeep` provider; keep
  `let invalidator: DeepMockProxy<SalesCacheInvalidator>`. Fix the fixture so
  `loadSale` resolves `{ id: saleId, status }`.
- [ ] Add tests (each condition in its own `describe`):
  - when the sale was GIFTED: `deleteSale` called with `(userId, saleId)`, `afterWrite`
    called with `(userId, saleId, { recipientChanged: true })`
  - when the sale was not GIFTED (PENDING): `afterWrite` with `recipientChanged: false`
  - when the sale does not exist: rejects `SALE_NOT_FOUND`, `deleteSale` and
    `afterWrite` not called
  - when the delete rejects: error propagates, `afterWrite` not called
- [ ] Run `npx vitest run src/api/sales/usecases/delete-sale/delete-sale.usecase.spec.ts`;
  expect failures.
- [ ] Implement in `delete-sale.usecase.ts`: import `SaleStatus` from `@prisma/client`
  and `SalesCacheInvalidator` from `../../shared/sales-cache.invalidator`; constructor
  `(private readonly usecaseDb: IDeleteSaleUsecaseDb, private readonly salesCacheInvalidator: SalesCacheInvalidator)`;
  body:

  ```ts
  await this.usecaseDb.deleteSale(userId, saleId);

  await this.salesCacheInvalidator.afterWrite(userId, saleId, {
      recipientChanged: existing.status === SaleStatus.GIFTED,
  });
  ```
- [ ] Re-run the spec; expect pass (type errors on the db signature are fixed in Task 2).

## Task 2: db layer drops Redis

**Files:** `delete-sale.usecase.db.ts`, `delete-sale.usecase.db.spec.ts`,
`delete-sale.usecase.module.ts`

- [ ] In `delete-sale.usecase.db.spec.ts`: remove the `RedisService` and `CACHE_KEYS`
  imports, the `redisService` variable and provider, and the four invalidation tests
  (accounting, sales and sale key, recipients GIFTED, recipients not GIFTED). Change
  `deleteSale` calls to `(userId, saleId)`. Drop `SaleStatus` from the Prisma import if
  `loadSale` tests no longer use it.
- [ ] In `delete-sale.usecase.db.ts`: remove `RedisService` and `CACHE_KEYS` imports,
  the `redisService` constructor param (constructor becomes
  `constructor(private readonly prisma: PrismaService) {}`), the invalidation block, and
  the `saleStatus` param from both the abstract class and the implementation. Keep
  `SaleStatus` import for `loadSale`'s return type.
- [ ] In `delete-sale.usecase.module.ts`: add `SalesCacheInvalidator` to `providers`
  (import from `../../shared/sales-cache.invalidator`). Keep `RedisModule` import.
- [ ] Check other callers/mocks of `deleteSale(` with three args:
  `grep -rn "deleteSale(" src e2e scripts` and fix any hits (sales service spec likely
  mocks the usecase, not the db).

## Task 3: verify

- [ ] `npx vitest run src/api/sales` passes.
- [ ] `npm run lint`, `npm run lint:deps` and typecheck (`npx tsc --noEmit`) pass.
- [ ] `npm run build` then `test -f dist/main.js` (exit 0 alone is not evidence).
- [ ] If a delete-sale e2e or int-spec exists, run it; none is expected to need edits.
- [ ] `git add -A`, stop, tell the user it is staged for `/crit`.
- [ ] Linear: move PSG-111 to In Progress when starting; In Review only once staged.
  Branch name must be `psg-111` (zero-pad rule gives `psg-111`); current branch is
  `nassau/psg-111-handle`, rename before first push.

## Follow-ups

None. Update `docs/tech-debt.md`: no entry mentions delete invalidation, nothing to remove.
