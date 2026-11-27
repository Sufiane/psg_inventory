# PSG-112 Delete-sale concurrency hardening — Implementation Plan

> **For agentic workers:** use superpowers:test-driven-development per task. Steps use `- [ ]` checkboxes.

**Goal:** a double delete returns 404 instead of 500, a racing gift no longer leaves the recipients cache stale, and every not-found path logs a warn with both ids.

**Spec:** `docs/specs/2026-11-26-psg-112-delete-sale-concurrency-hardening-design.md`

**Size / split:** one PR, backend-only, about 160 lines including tests (db about 20, usecase about 15, unit specs about 70, int-spec about 55). Well under the 800-line cap. No split.

**Conventions:** Vitest (`vi`, `vitest-mock-extended`). Describe one condition per block. Explicit return types. Branded `UserId`/`SaleId`. Only the db file imports the Prisma client. No new comments unless they carry a non-obvious why. Commits use Conventional Commits.

All paths below are under `src/api/sales/usecases/delete-sale/`.

---

### Task 1: Db: map P2025 to null and return the deleted id

**Files:** `delete-sale.usecase.db.ts`, `delete-sale.usecase.db.spec.ts`

- [ ] **Step 1: tests first** (in `delete-sale.usecase.db.spec.ts`)
  - Add `Logger` from `@nestjs/common` and
    `warnSpy = vi.spyOn(Logger.prototype, 'warn').mockClear()` in `beforeEach`. Copy
    the `p2025RecordGone()` helper from `ungift-sale.usecase.db.spec.ts`. Use the
    message `'Record to delete does not exist.'`.
  - `loadSale` test: expect `select: { id: true }`, and adjust the fixture to `{ id: saleId }`.
  - `describe('deleteSale')`:
    - The existing test also asserts
      `tx.sales.delete` is called with `{ where: { id: saleId, userId }, select: { id: true } }`.
    - `describe('when the delete succeeds')`: `tx.sales.delete.mockResolvedValueOnce({ id: saleId } as never)`.
      `it('returns the deleted id')` expects `{ id: saleId }`.
    - `describe('when the sale row is already gone')`: `tx.sales.delete.mockRejectedValueOnce(p2025RecordGone())`.
      - `it('returns null')`
      - `it('logs the caught P2025')`: `warnSpy` is called with `stringContaining('P2025')`, `objectContaining({ code: 'P2025' })`.
    - `describe('when the delete fails for another reason')`: reject with `new Error('db down')`.
      `it('rethrows')`.
- [ ] **Step 2:** `npx vitest run src/api/sales/usecases/delete-sale/delete-sale.usecase.db.spec.ts`. Expect FAIL.
- [ ] **Step 3: implement**
  - Interface:
    ```ts
    abstract loadSale(userId: UserId, saleId: SaleId): Promise<{ id: string } | null>;
    abstract deleteSale(userId: UserId, saleId: SaleId): Promise<{ id: string } | null>;
    ```
  - Add `private readonly logger = new Logger(DeleteSaleUsecaseDb.name)`.
  - `loadSale`: `select: { id: true }`.
  - `deleteSale`: wrap the transaction in `try`. The transaction callback returns
    `tx.sales.delete({ where: { id: saleId, userId }, select: { id: true } })`.
    In `catch`, if the error is `Prisma.PrismaClientKnownRequestError` with code `'P2025'`,
    call `this.logger.warn('deleteSale: P2025 mapped to the not-found outcome', { code, message, meta })`
    and `return null`. Otherwise `throw error`. Same shape as `UngiftSaleUsecaseDb.ungiftSale`.
    Skip the long comment that file uses. Only `sales.delete` can raise P2025 here, and
    `deleteMany` never does.
- [ ] **Step 4:** re-run. Expect PASS. `npm run typecheck` fails in the usecase until Task 2, which is expected.

### Task 2: Usecase: always invalidate recipients, warn on not-found

**Files:** `delete-sale.usecase.ts`, `delete-sale.usecase.spec.ts`

- [ ] **Step 1: tests first**
  - Add `warnSpy` (same as Task 1). `loadSale` mocks become `{ id: saleId }`.
  - `describe('when the sale exists')`: `loadSale` resolves `{ id }`, `deleteSale` resolves `{ id }`.
    `it`s: deletes; invalidates with `recipientChanged: true`. Replaces the old GIFTED / non-GIFTED split.
  - `describe('when the sale does not exist')`: the existing tests, plus
    `it('logs a warning with the user and sale ids')`, which expects `warnSpy` to be
    called with `stringContaining(saleId)` and `stringContaining(userId)`. Assert
    each id with its own `expect`, using `warnSpy.mock.calls[0]?.[0]`.
  - New `describe('when the sale vanishes before the delete')`: `loadSale` resolves `{ id }`, `deleteSale` resolves `null`.
    - `it('rejects with SALE_NOT_FOUND')`
    - `it('does not invalidate')`
    - `it('logs a warning with the user and sale ids')`
  - `describe('when the delete rejects')`: unchanged apart from the `loadSale` mock shape.
- [ ] **Step 2:** `npx vitest run src/api/sales/usecases/delete-sale/delete-sale.usecase.spec.ts`. Expect FAIL.
- [ ] **Step 3: implement**
  ```ts
  private readonly logger = new Logger(DeleteSaleUsecase.name);

  async execute(userId: UserId, saleId: SaleId): Promise<void> {
      const existing = await this.usecaseDb.loadSale(userId, saleId);

      if (!existing) {
          this.throwNotFound(userId, saleId);
      }

      const deleted = await this.usecaseDb.deleteSale(userId, saleId);

      if (!deleted) {
          this.throwNotFound(userId, saleId);
      }

      await this.salesCacheInvalidator.afterWrite(userId, saleId, {
          recipientChanged: true,
      });
  }

  private throwNotFound(userId: UserId, saleId: SaleId): never {
      this.logger.warn(`Sale ${saleId} not found for user ${userId}`);

      throw new DomainException(ErrorCode.SALE_NOT_FOUND);
  }
  ```
  If the `never` return does not narrow `deleted` (TS needs an explicitly typed `this`
  method for that), write `throw this.notFound(userId, saleId)` instead, with
  `notFound(): DomainException` logging and returning the exception.
- [ ] **Step 4:** run both delete-sale specs plus `npm run typecheck` and `npm run lint`. Expect PASS.
- [ ] **Step 5:** commit `fix(sales): map double-delete p2025 to sale_not_found and always invalidate recipients`.

### Task 3: Int-spec against a real database

**Files:** create `delete-sale.usecase.db.int-spec.ts`

- [ ] **Step 1:** copy the scaffold from `ungift-sale.usecase.db.int-spec.ts`:
  `new PrismaService()`, connect and disconnect, `usecaseDb = new DeleteSaleUsecaseDb(prisma)`,
  and an `afterEach` that calls `deleteRealDbSale`. That function uses `deleteMany`,
  so it is safe after the sale is already gone.
  - `describe('when the sale exists')`: create a fixture.
    - `it('returns the deleted id')`
  - `describe('when the sale was already deleted')`: create a PENDING fixture, then
    call `deleteSale` once in `beforeEach`.
    - `it('returns null')` on the second call.
- [ ] **Step 2:** `npm run local:db:up && npm run local:db:migrate && npm run test:integration`. Expect PASS.
  This is the check that real Prisma 6.0.1 raises P2025 for `delete` on a missing row.
- [ ] **Step 3:** `npm run lint:deps`. Expect PASS. The directory already exists, so no new exemption should be needed.
- [ ] **Step 4:** commit `test(sales): cover delete-sale p2025 against a real database`.

### Done when

- `npm test`, `npm run test:integration`, `npm run typecheck`, `npm run lint` and `npm run lint:deps` are all green.
- No change to `docs/tech-debt.md`. It has no delete-sale entry.
