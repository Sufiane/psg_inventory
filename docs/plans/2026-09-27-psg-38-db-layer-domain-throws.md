# PSG-38 — db-layer DomainException removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every `DomainException` throw from the db layer (`*.db.ts` / `src/db/**`), moving each throw into the calling usecase/service, and delete the two duplicated sale-row existence reads — with byte-identical HTTP behaviour.

**Architecture:** Each `*.usecase.db.ts` write method stops reading (and judging) the sale row it operates on: the calling usecase, which has already loaded and validated the row, passes it in as data (`currentSale`, a payload field for update-sale, a third parameter for ungift-sale), and the write reports what physically happened as plain data — `'written' | 'not_found'` (or `{ recipientId } | null` for the gift writes) — by catching Prisma `P2025` when the row was deleted between the usecase's load and the transaction. The calling usecase translates a not-found outcome into `DomainException(SALE_NOT_FOUND)`, so the concurrent-delete interleaving still answers 404, and cache invalidation runs only on the written path. `UsersDb.create` returns `Users | null` (null on Prisma P2002) and `UsersService.create` throws `EMAIL_ALREADY_EXISTS` — the same signal→data→throw shape. An optional final task adds a dependency-cruiser rule that makes the convention mechanical.

**Tech Stack:** NestJS 12, Prisma 6, TypeScript 6, Vitest 5 (+ `vitest-mock-extended`), dependency-cruiser 17.

**Spec:** `docs/specs/2026-09-27-psg-38-db-layer-domain-throws-design.md` — the plan argues from the spec; executors read both.

## Global Constraints

- **Behaviour-preserving on the wire:** `sale_not_found` must still map to HTTP 404 and `email_already_exists` to HTTP 409 (`src/common/exceptions/http-exception.mapper.ts`). Any test/evidence of a changed status code is a failure — including the concurrent-delete interleaving (sale deleted between the usecase's load and the write), which must still answer 404 via `P2025 → 'not_found'/null → SALE_NOT_FOUND` (spec D1/D2, required change, not an accepted delta).
- **Write methods report outcomes; they never throw and never re-read:** no `DomainException` from any db file; the not-found outcome comes from catching `P2025` on the write that already ran inside the existing transaction — a new `findUnique` read is forbidden (spec Goal 3). Cache invalidation must be skipped on the not-found path at both layers (the db's post-transaction invalidation and the usecase's `salesCacheInvalidator.afterWrite`) — the db specs and usecase specs assert the skip.
- **No frontend work:** nothing under `web/` may change (it keys off HTTP status codes only).
- **No schema/DI changes:** no Prisma schema edits, no migrations, no changes to any `*.module.ts`, no route/DTO changes.
- **After this work, zero files matching `src/db/**` or `*.db.ts` may import `src/common/exceptions/domain.exception.ts` or `src/common/exceptions/error-codes.enum.ts`** (spec files under `src/db/` excepted from the optional rule, but aim for zero anywhere in db files).
- Tests are Vitest: `npm test` runs `vitest run`; target a single file with `npx vitest run <path>`. Follow the CLAUDE.md test style: one `describe` per branch (`when X`), `it` titles state the outcome.
- Commits are Conventional Commits (commitlint enforces, e.g. `refactor(update-sale): …`).
- **Full gate after every task** (run in this order, all must pass):
  ```bash
  npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build
  ```
- Tasks 2, 3 and 4 touch disjoint files and are independent; they may be executed in any order or by parallel builders. Task 5 depends on Tasks 2–4 being merged (the rule only passes on a fixed tree).

---

### Task 1: Green baseline

**Files:** none modified.

**Interfaces:** none.

- [x] **Step 1: Install dependencies if needed and confirm the tree is clean**

Run: `test -d node_modules && echo present || npm ci`
Expected: `present`, or a successful install.

- [x] **Step 2: Run the full gate on the untouched tree**

Run: `npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build`
Expected: all five pass. If the baseline is red, STOP — fix or report before touching anything; every later task assumes this baseline.

---

### Task 2: ungift-sale — one row read, throw stays in the usecase, write reports an outcome

The usecase already loads the sale and throws `SALE_NOT_FOUND`/`SALE_INVALID_STATUS_TRANSITION` (`src/api/sales/usecases/ungift-sale/ungift-sale.usecase.ts:19-31`). This task widens that single read, hands the row to the db write, and deletes the db's duplicate read + throw. The write then reports what physically happened as plain data — `'written'`, or `'not_found'` when Prisma `P2025` proves the row was deleted between the usecase's load and the transaction (Prisma rolls the transaction back automatically) — and the usecase turns `'not_found'` into `SALE_NOT_FOUND`, so the concurrent-delete interleaving still answers 404 (spec D2). Cache invalidation runs only on the written path.

**Files:**
- Modify: `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.ts`
- Modify: `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.ts`
- Test: `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts`
- Test: `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts`
- New: `src/common/exceptions/http-exception.mapper.spec.ts` — the wire-mapping pin for `SALE_NOT_FOUND → 404` and `EMAIL_ALREADY_EXISTS → 409` (Step 7). Owned by this task so parallel builders on Tasks 3/4 don't both create it; Task 3's 404 claim leans on it.

**Interfaces:**
- Consumes: `Prisma` alongside the existing `SaleStatus` from `@prisma/client` (for `Prisma.PrismaClientKnownRequestError`); existing `PrismaService.sales.findUnique` / `$transaction`.
- Produces (both files, exact contract):
  ```ts
  // ungift-sale.usecase.db.ts
  export type SaleRowSnapshot = {
      id: string;
      status: SaleStatus;
      listedPrice: number;
      profit: number;
  };

  // The db reports what physically happened — plain data, no domain
  // imports (spec D2; keeps the D4 dependency-cruiser rule valid).
  export type SaleWriteOutcome = 'written' | 'not_found';

  export abstract class IUngiftSaleUsecaseDb {
      abstract loadSale(userId: UserId, saleId: SaleId): Promise<SaleRowSnapshot | null>;
      abstract ungiftSale(
          userId: UserId,
          saleId: SaleId,
          currentSale: SaleRowSnapshot,
      ): Promise<SaleWriteOutcome>;
  }
  ```
  The usecase must call `ungiftSale(userId, saleId, existing)` where `existing` is the non-null result of `loadSale`, and throw `DomainException(SALE_NOT_FOUND)` when the outcome is `'not_found'`.

- [x] **Step 1: Rewrite the db spec against the new contract (expect RED)**

In `ungift-sale.usecase.db.spec.ts`:

1. In the `loadSale` describe, change the expected select and fixture:

```ts
it('queries prisma.sales.findUnique with userId, saleId and the snapshot fields', async () => {
    const expected = {
        id: saleId,
        status: SaleStatus.GIFTED,
        listedPrice: 100,
        profit: 90,
    };
    prisma.sales.findUnique.mockResolvedValueOnce(expected as never);

    const result = await usecaseDb.loadSale(userId, saleId);

    expect(result).toEqual(expected);
    expect(prisma.sales.findUnique).toHaveBeenCalledWith({
        where: { userId, id: saleId },
        select: { id: true, status: true, listedPrice: true, profit: true },
    });
});
```

2. In the `ungiftSale` describe: delete the `beforeEach` that seeds `prisma.sales.findUnique.mockResolvedValue(currentSale as never)` (line ~87) and delete the test `'throws SALE_NOT_FOUND when the sale does not exist'` (lines ~90-96). Keep the `currentSale` const — it becomes the snapshot argument. Then delete the now-unused `import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';` (line ~10) — lint (`--max-warnings 0`) rejects unused imports.
3. Add `currentSale` as the third argument at the two remaining `usecaseDb.ungiftSale(userId, saleId)` call sites (in `'deletes gift rows, resets sale to PENDING…'` and `'invalidates all four cache namespaces'`): `usecaseDb.ungiftSale(userId, saleId, currentSale)`.
4. Capture and assert the success outcome in the transaction test (item 3's first call site):

```ts
const result = await usecaseDb.ungiftSale(userId, saleId, currentSale);
// …existing tx.gifts / tx.sales / tx.saleHistories assertions unchanged…
expect(result).toBe('written');
```

5. Add a regression guard for the duplicate read:

```ts
it('does not re-read the sale row — the usecase already loaded it', async () => {
    mockTransaction();

    await usecaseDb.ungiftSale(userId, saleId, currentSale);

    expect(prisma.sales.findUnique).not.toHaveBeenCalled();
});
```

6. Add a `P2025` factory next to `mockTransaction()` and a new describe for the concurrent-delete branch (spec D2):

```ts
function p2025RecordGone(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
        code: 'P2025',
        clientVersion: '6.0.1',
    });
}
```

```ts
describe('when the sale row is deleted between the load and the write', () => {
    it('reports not_found, skips cache invalidation and re-reads nothing', async () => {
        const tx = mockTransaction();
        tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

        const result = await usecaseDb.ungiftSale(userId, saleId, currentSale);

        expect(result).toBe('not_found');
        expect(prisma.sales.findUnique).not.toHaveBeenCalled();
        expect(redisService.invalidatePattern).not.toHaveBeenCalled();
        expect(redisService.invalidate).not.toHaveBeenCalled();
    });
});
```

- [x] **Step 2: Run the db spec to verify RED**

Run: `npx vitest run src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts`
Expected: FAIL — the old implementation still calls `prisma.sales.findUnique` (the new `not.toHaveBeenCalled()` guard), throws `SALE_NOT_FOUND` where the spec now expects `'written'`/`'not_found'` outcomes, and never reaches the not-found branch (the P2025 test sees the old throw instead of a returned outcome). (`currentSale` as a 3rd argument is ignored by the old JS at runtime; type errors surface at Task 2's `npm run typecheck` gate.)

- [x] **Step 3: Implement the db change**

In `ungift-sale.usecase.db.ts`:

1. Delete the imports of `DomainException` and `ErrorCode` (lines 5-6), and widen the prisma import: `import { Prisma, SaleStatus } from '@prisma/client';` (was `SaleStatus` only). Leave every other import.
2. Add the exported types and rewrite the abstract class:

```ts
export type SaleRowSnapshot = {
    id: string;
    status: SaleStatus;
    listedPrice: number;
    profit: number;
};

// The db reports what physically happened — plain data, no domain
// imports (spec D2; keeps the D4 dependency-cruiser rule valid).
export type SaleWriteOutcome = 'written' | 'not_found';

export abstract class IUngiftSaleUsecaseDb {
    abstract loadSale(userId: UserId, saleId: SaleId): Promise<SaleRowSnapshot | null>;
    abstract ungiftSale(
        userId: UserId,
        saleId: SaleId,
        currentSale: SaleRowSnapshot,
    ): Promise<SaleWriteOutcome>;
}
```

3. Widen the `loadSale` implementation's select and declared return type:

```ts
async loadSale(
    userId: UserId,
    saleId: SaleId,
): Promise<SaleRowSnapshot | null> {
    return this.prisma.sales.findUnique({
        where: { userId, id: saleId },
        select: { id: true, status: true, listedPrice: true, profit: true },
    });
}
```

4. Replace `ungiftSale` (removes the `findUnique` read, the `DomainException` throw, wraps the write in `try/catch`, and skips invalidation on the not-found path — the whole transaction + invalidation sits inside `try` so a `P2025` returns early before any `redisService` call):

```ts
async ungiftSale(
    userId: UserId,
    saleId: SaleId,
    currentSale: SaleRowSnapshot,
): Promise<SaleWriteOutcome> {
    try {
        await this.prisma.$transaction(async (tx) => {
            // Gift row first, then the status. Postgres rejects the reverse
            // order (spec D15).
            await tx.gifts.deleteMany({ where: { saleId } });

            // Reset status to PENDING. Timestamps only change for
            // SOLD/CANCELLED transitions — GIFTED → PENDING touches neither.
            await tx.sales.update({
                data: { status: SaleStatus.PENDING },
                where: { id: saleId, userId },
            });

            // History entry captures the pre-write state, from the row the
            // usecase already loaded.
            await tx.saleHistories.create({
                data: {
                    saleId: currentSale.id,
                    listedPrice: currentSale.listedPrice,
                    profit: currentSale.profit,
                    status: currentSale.status,
                },
            });
        });

        // Invalidate all four cache namespaces — written path only. On
        // not_found the transaction rolled back, nothing is stale because
        // of us, and the pre-fix throw also fired before any invalidation
        // (spec D2 / behaviour item 4).
        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId));
        await this.redisService.invalidate(CACHE_KEYS.sale(saleId));
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateRecipients(userId),
        );

        return 'written';
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            // The row vanished between the usecase's load and this write;
            // Prisma rolled the transaction back. The only write in here
            // that can raise P2025 is tx.sales.update (deleteMany never
            // throws for missing rows, saleHistories.create would raise
            // P2003), so this mapping is exact. The db reports what
            // happened as data — the usecase decides what it means.
            return 'not_found';
        }
        throw e;
    }
}
```

Any non-`P2025` error (including a redis invalidation failure on the written path) rethrows unchanged → 500, exactly as today.

- [x] **Step 4: Run the db spec to verify GREEN**

Run: `npx vitest run src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts`
Expected: PASS (all tests, including the new no-re-read guard and the new P2025 → `'not_found'` test with its skip-invalidation assertions).

- [x] **Step 5: Update the usecase spec against the outcome contract (expect RED)**

In `ungift-sale.usecase.spec.ts`, rework the `'when the sale is GIFTED'` happy path so the assertion pins the passed row and the success outcome:

```ts
describe('when the sale is GIFTED', () => {
    it('delegates the loaded row to the usecase db layer', async () => {
        const loaded = saleFixture(SaleStatus.GIFTED);
        usecaseDb.loadSale.mockResolvedValueOnce(loaded);
        usecaseDb.ungiftSale.mockResolvedValueOnce('written');

        await usecase.execute(userId, saleId);

        expect(usecaseDb.ungiftSale).toHaveBeenCalledWith(userId, saleId, loaded);
    });
});
```

Add a new describe for the preserved-404 branch (spec D2 — the usecase still owns the throw):

```ts
describe('when the row is deleted between the load and the write', () => {
    it('rejects with SALE_NOT_FOUND', async () => {
        usecaseDb.loadSale.mockResolvedValueOnce(saleFixture(SaleStatus.GIFTED));
        usecaseDb.ungiftSale.mockResolvedValueOnce('not_found');

        await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
            code: ErrorCode.SALE_NOT_FOUND,
        });
    });
});
```

Leave the `SALE_INVALID_STATUS_TRANSITION` and `SALE_NOT_FOUND` tests untouched — the usecase still throws both.

Run: `npx vitest run src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts`
Expected: FAIL — the usecase still calls `ungiftSale(userId, saleId)` (2 args, so the 3-arg assertion fails) and ignores the outcome (so the `'not_found'` test resolves instead of rejecting).

- [x] **Step 6: Update the usecase so the throw decision lives here (expect GREEN)**

In `ungift-sale.usecase.ts`, replace line 30:

```ts
const outcome = await this.usecaseDb.ungiftSale(userId, saleId, existing);

if (outcome === 'not_found') {
    throw new DomainException(ErrorCode.SALE_NOT_FOUND);
}
```

(The load-time throws at lines 22-28 stay exactly as they are — together with the outcome check above they are the only existence checks in the flow, and both live in the usecase, mapping to 404 as before. No import changes — `DomainException`/`ErrorCode` are already imported.)

Run: `npx vitest run src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts`
Expected: PASS.

- [x] **Step 7: Pin the wire mapping (new file, green on arrival)**

Create `src/common/exceptions/http-exception.mapper.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';

import { toHttpException } from './http-exception.mapper';
import { DomainException } from './domain.exception';
import { ErrorCode } from './error-codes.enum';

describe('toHttpException', () => {
    describe('when the error is SALE_NOT_FOUND', () => {
        it('maps to 404 — the wire contract of every sale not-found path', () => {
            const result = toHttpException(new DomainException(ErrorCode.SALE_NOT_FOUND));

            expect(result).toBeInstanceOf(NotFoundException);
            expect(result.getStatus()).toBe(404);
        });
    });

    describe('when the error is EMAIL_ALREADY_EXISTS', () => {
        it('maps to 409 — unchanged by Tasks 3 and 4', () => {
            const result = toHttpException(
                new DomainException(ErrorCode.EMAIL_ALREADY_EXISTS),
            );

            expect(result).toBeInstanceOf(ConflictException);
            expect(result.getStatus()).toBe(409);
        });
    });
});
```

Run: `npx vitest run src/common/exceptions/http-exception.mapper.spec.ts`
Expected: PASS immediately — this is a pinning test for behaviour that already exists (it locks the last link of the chain `P2025 → 'not_found' → SALE_NOT_FOUND → 404`, whose first two links the db/usecase tests above cover). If it fails, the mapping is genuinely broken and that is a finding, not a red step to fix.

- [x] **Step 8: Run the full gate**

Run: `npx vitest run src/api/sales/usecases/ungift-sale && npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build`
Expected: all pass. (`typecheck` here is the first point that validates the widened `loadSale` select, the 3-arg call, and the `SaleWriteOutcome` contract; `npm test` includes the new mapper spec.)

- [ ] **Step 9: Commit** — SKIPPED by instruction: all changes left uncommitted for the user's final review.

```bash
git add src/api/sales/usecases/ungift-sale/ src/common/exceptions/http-exception.mapper.spec.ts
git commit -m "refactor(ungift-sale): pass the loaded sale row into the write, drop db-layer throw"
```

---

### Task 3: update-sale — pre-write row becomes a payload field, writes report an outcome

`UpdateSaleUsecase.execute` already loads `existing` and throws `SALE_NOT_FOUND` (`update-sale.usecase.ts:31-35`). This task deletes the db's duplicate `loadSaleRowOrThrow` (read + throw) and feeds `applySaleWrite` from the payload instead. Each write method then reports what physically happened — `updateSale` returns `'written' | 'not_found'`, `giftSale`/`updateGift` return `{ recipientId } | null` — by catching Prisma `P2025` (row deleted between the usecase's load and the transaction; rollback is automatic), and the usecase translates the not-found outcome into `SALE_NOT_FOUND` before `salesCacheInvalidator.afterWrite`, so the concurrent-delete interleaving still answers 404 and no cache invalidation runs on that path (spec D1 Part B). (The 404 wire pin lives in Task 2's `http-exception.mapper.spec.ts` — do not create that file here.)

**Files:**
- Modify: `src/api/sales/usecases/update-sale/update-sale.usecase.db.ts`
- Modify: `src/api/sales/usecases/update-sale/update-sale.usecase.ts`
- Test: `src/api/sales/usecases/update-sale/update-sale.usecase.db.spec.ts`
- Test: `src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts`

**Interfaces:**
- Consumes: `Sale` (from `src/db/sales/type/sale.type.ts`) as the source of `currentSale`; `Prisma` (already imported) for `Prisma.PrismaClientKnownRequestError`.
- Produces (exact contract):

```ts
// update-sale.usecase.db.ts
export type SaleRowSnapshot = {
    id: string;
    status: SaleStatus;
    listedPrice: number;
    profit: number;
};

// The db reports what physically happened — plain data, no domain
// imports (spec D1 Part B; keeps the D4 dependency-cruiser rule valid).
export type SaleWriteOutcome = 'written' | 'not_found';

export abstract class IUpdateSaleUsecaseDb {
    abstract getOneSale(userId: UserId, saleId: SaleId): Promise<Sale | null>;
    abstract updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        status?: 'PENDING' | 'SOLD';
        allocations?: SaleAllocationInput[];
        currentSale: SaleRowSnapshot;   // required, new
    }): Promise<SaleWriteOutcome>;      // was void
    abstract giftSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
        currentSale: SaleRowSnapshot;   // required, new
    }): Promise<{ recipientId: RecipientId } | null>;   // null = row gone
    abstract updateGift(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient?: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
        currentSale: SaleRowSnapshot;   // required, new
    }): Promise<{ recipientId: RecipientId } | null>;   // null = row gone
}
```

  The usecase passes `currentSale: existing` at all three call sites and throws `DomainException(SALE_NOT_FOUND)` when the outcome is `'not_found'` (updateSale) or the result is `null` (giftSale/updateGift).

- [x] **Step 1: Rewrite the db spec against the new contract (expect RED)**

In `update-sale.usecase.db.spec.ts`:

1. Import the (not-yet-existing) type as type-only, and retype the row helper (drop `userId` — nothing consumes it any more):

```ts
import type { SaleRowSnapshot } from './update-sale.usecase.db';
```

```ts
function currentSaleRow(
    overrides: Partial<{ status: SaleStatus }> = {},
): SaleRowSnapshot {
    return {
        id: saleId,
        status: SaleStatus.PENDING,
        listedPrice: 100,
        profit: 90,
        ...overrides,
    };
}
```

2. Delete the three `beforeEach` seeds of `prisma.sales.findUnique.mockResolvedValue(...)` in the `updateSale`, `giftSale` and `updateGift` describes (lines ~85-87, ~140-142, ~264-268).
3. Add `currentSale: currentSaleRow()` to every write-method invocation — all 11: `updateSale` (lines ~92, ~110, ~128), `giftSale` (~154, ~202, ~217, ~230, ~249), `updateGift` (~274, ~301, ~320). For the `updateGift` tests that previously ran against a GIFTED row, use `currentSale: currentSaleRow({ status: SaleStatus.GIFTED })` where the old `beforeEach` seeded GIFTED; this does not change what is asserted (the history/mirror values were `PENDING`/`GIFTED` only via that seed).
4. In the first `updateSale` test (`'writes the narrowed status and no gift row'`), capture the result and assert the success outcome: `const result = await usecaseDb.updateSale({...})` … then `expect(result).toBe('written');`. (`giftSale`'s and `updateGift`'s success tests already assert `result` equals `{ recipientId: … }` — unchanged under the new contract.)
5. Add a `P2025` factory next to `mockTransaction()`:

```ts
function p2025RecordGone(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
        code: 'P2025',
        clientVersion: '6.0.1',
    });
}
```

6. Replace the whole `describe('when the sale does not belong to the user')` block (lines ~123-136, the `throws SALE_NOT_FOUND` test) with:

```ts
it('does not re-read the sale row — the usecase already loaded it', async () => {
    mockTransaction();

    await usecaseDb.updateSale({
        saleId,
        userId,
        profit: undefined,
        status: 'SOLD',
        currentSale: currentSaleRow(),
    });

    expect(prisma.sales.findUnique).not.toHaveBeenCalled();
});
```

7. Add one new top-level describe (after the `updateGift` describe) covering the concurrent-delete branch for all three write methods (spec D1 Part B). Each test also proves no new read was introduced and that invalidation is skipped:

```ts
describe('when the sale row is deleted between the load and the write', () => {
    it('updateSale reports not_found, skips cache invalidation and re-reads nothing', async () => {
        const tx = mockTransaction();
        tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

        const result = await usecaseDb.updateSale({
            saleId,
            userId,
            profit: undefined,
            status: 'SOLD',
            currentSale: currentSaleRow(),
        });

        expect(result).toBe('not_found');
        expect(prisma.sales.findUnique).not.toHaveBeenCalled();
        expect(redisService.invalidatePattern).not.toHaveBeenCalled();
        expect(redisService.invalidate).not.toHaveBeenCalled();
    });

    it('giftSale reports null, skips cache invalidation and re-reads nothing', async () => {
        const tx = mockTransaction();
        tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

        const result = await usecaseDb.giftSale({
            saleId,
            userId,
            profit: undefined,
            recipient: { recipientId: 'r5' as RecipientId },
            currentSale: currentSaleRow(),
        });

        expect(result).toBeNull();
        expect(prisma.sales.findUnique).not.toHaveBeenCalled();
        expect(redisService.invalidatePattern).not.toHaveBeenCalled();
        expect(redisService.invalidate).not.toHaveBeenCalled();
    });

    it('updateGift reports null, skips cache invalidation and re-reads nothing', async () => {
        const tx = mockTransaction();
        tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

        const result = await usecaseDb.updateGift({
            saleId,
            userId,
            profit: undefined,
            recipient: { recipientId: 'r2' as RecipientId },
            currentSale: currentSaleRow({ status: SaleStatus.GIFTED }),
        });

        expect(result).toBeNull();
        expect(prisma.sales.findUnique).not.toHaveBeenCalled();
        expect(redisService.invalidatePattern).not.toHaveBeenCalled();
        expect(redisService.invalidate).not.toHaveBeenCalled();
    });
});
```

(`tx.sales.update` is the first awaited statement inside `applySaleWrite`, so the rejection fires before any recipient/gift work; the outcome comes from the write that already ran — never from a `findUnique`.)

- [x] **Step 2: Run the db spec to verify RED**

Run: `npx vitest run src/api/sales/usecases/update-sale/update-sale.usecase.db.spec.ts`
Expected: FAIL — the old implementation still performs `prisma.sales.findUnique` (guard fails), throws `SALE_NOT_FOUND` where the spec now expects `'written'` outcomes, and throws instead of returning `'not_found'`/`null` in the three new P2025 tests (the seeded mock no longer exists).

- [x] **Step 3: Implement the db change**

In `update-sale.usecase.db.ts`:

1. Delete the `DomainException` and `ErrorCode` imports (lines 8-9). (`Prisma` on line 2 stays — it is needed for `Prisma.PrismaClientKnownRequestError`.)
2. Add the exported types near the top (after the `sumTickets` helper):

```ts
export type SaleRowSnapshot = {
    id: string;
    status: SaleStatus;
    listedPrice: number;
    profit: number;
};

// The db reports what physically happened — plain data, no domain
// imports (spec D1 Part B; keeps the D4 dependency-cruiser rule valid).
export type SaleWriteOutcome = 'written' | 'not_found';
```

3. In `IUpdateSaleUsecaseDb`, add `currentSale: SaleRowSnapshot;` as the last field of the `updateSale`, `giftSale` and `updateGift` payload types, and change the return types: `updateSale → Promise<SaleWriteOutcome>` (was `Promise<void>`), `giftSale`/`updateGift → Promise<{ recipientId: RecipientId } | null>` (spec/contract block above is authoritative).
4. Retype `applySaleWrite`'s `currentSale` parameter to `SaleRowSnapshot` (shape is identical to its current inline type — no body change).
5. Delete the private `loadSaleRowOrThrow` method entirely (lines ~206-219).
6. Rewrite `updateSale` — the whole transaction **and** invalidation sit inside `try` so a `P2025` returns early, before any `redisService` call:

```ts
async updateSale(payload: {
    saleId: SaleId;
    userId: UserId;
    profit: Profit | undefined;
    invest?: Invest;
    listedPrice?: ListedPrice;
    status?: 'PENDING' | 'SOLD';
    allocations?: SaleAllocationInput[];
    currentSale: SaleRowSnapshot;
}): Promise<SaleWriteOutcome> {
    try {
        await this.prisma.$transaction(async (tx) => {
            await this.applySaleWrite(tx, payload.currentSale, payload);
        });

        await this.invalidateSaleCaches(payload.userId, payload.saleId);

        return 'written';
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            // The row the usecase loaded was deleted before this write;
            // Prisma rolled the transaction back. The only write that can
            // raise P2025 here is tx.sales.update (allocations/history are
            // creates, so they never do). The db reports what happened as
            // data — the usecase decides what it means.
            return 'not_found';
        }
        throw e;
    }
}
```

7. Rewrite `giftSale` the same way — delete the `loadSaleRowOrThrow` line, pass `payload.currentSale` to `applySaleWrite`, and keep the `const recipientId` binding *inside* the `try` (the original comment about Prisma handing the callback's return value back still holds):

```ts
async giftSale(payload: {
    saleId: SaleId;
    userId: UserId;
    profit: Profit | undefined;
    invest?: Invest;
    listedPrice?: ListedPrice;
    recipient: GiftRecipientInput;
    allocations?: SaleAllocationInput[];
    currentSale: SaleRowSnapshot;
}): Promise<{ recipientId: RecipientId } | null> {
    try {
        // Prisma's interactive transaction hands back whatever the callback
        // returns, which keeps the resolved id out of a mutable outer binding.
        const recipientId = await this.prisma.$transaction(async (tx) => {
            // Status first: the (sale_id, sale_status) foreign key means a gift
            // row can only be inserted against a sale that is *already* GIFTED.
            // The order is the database's rule, not a convention (spec D15).
            await this.applySaleWrite(tx, payload.currentSale, {
                ...payload,
                status: SaleStatus.GIFTED,
            });

            const resolvedRecipientId = await this.resolveRecipientId(
                tx,
                payload.userId,
                payload.recipient,
            );

            await tx.gifts.create({
                data: {
                    saleId: payload.saleId,
                    saleStatus: SaleStatus.GIFTED,
                    recipientId: resolvedRecipientId,
                    giftedAt: new Date(),
                },
            });

            return resolvedRecipientId;
        });

        await this.invalidateSaleCaches(payload.userId, payload.saleId);

        return { recipientId };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            // tx.sales.update ran first inside applySaleWrite, so a vanished
            // sale reports here before any gift/recipient work. Same signal →
            // data pipeline as UsersDb.create's P2002 → null (spec D1/D3).
            return null;
        }
        throw e;
    }
}
```

8. Rewrite `updateGift` the same way (delete `loadSaleRowOrThrow`, pass `payload.currentSale` to `applySaleWrite(tx, payload.currentSale, payload)`, `try`/`catch` wrapping transaction + invalidation + `return { recipientId }`, `catch → P2025 → null` / rethrow). The `tx.gifts.findUniqueOrThrow` branch stays untouched inside the transaction.

Notes for items 6-8:

- The `catch` matches **any** `P2025` raised inside the transaction. In `updateSale`/`giftSale` the only source is `tx.sales.update`. In `updateGift`, `tx.gifts.findUniqueOrThrow` / `tx.gifts.update` can also raise `P2025` if a GIFTED sale has no gift row — a state the API cannot produce (spec D15) — which then reports `'not_found'` → 404 where the pre-fix code propagated it → 500 (spec behaviour item 3, the one acknowledged delta; document, do not defend).
- Any non-`P2025` error — including a redis invalidation failure on the written path — rethrows unchanged → 500, exactly as today.
- No new `findUnique` read: the outcome is the physical result of `tx.sales.update` inside the transaction that already ran.

- [x] **Step 4: Run the db spec to verify GREEN**

Run: `npx vitest run src/api/sales/usecases/update-sale/update-sale.usecase.db.spec.ts`
Expected: PASS (including the three new P2025 tests with their skip-invalidation and no-`findUnique` assertions).

- [x] **Step 5: Pin the new contract from the usecase spec (expect RED)**

In `update-sale.usecase.spec.ts`, in the test `'calls the generic update with the narrowed status'` (line ~761), extend the matcher so the forwarded row is asserted:

```ts
expect(db.updateSale).toHaveBeenCalledWith(
    expect.objectContaining({
        status: 'SOLD',
        currentSale: expect.objectContaining({ id: saleId }),
    }),
);
```

Then add a new describe covering the usecase side of the preserved-404 chain — one test per write branch (spec D1 Part B). Each proves the outcome check fires *before* `salesCacheInvalidator.afterWrite`, i.e. before `redisService.invalidatePattern`:

```ts
describe('when the sale row is deleted between the load and the write', () => {
    it('rejects with SALE_NOT_FOUND for the plain update', async () => {
        db.getOneSale.mockResolvedValueOnce(
            saleFixture(new Date(Date.now() + 60 * 60_000)),
        );
        db.updateSale.mockResolvedValueOnce('not_found');

        await expect(
            usecase.execute(userId, { saleId, status: 'SOLD' } as UpdateSaleDto),
        ).rejects.toMatchObject({ code: ErrorCode.SALE_NOT_FOUND });

        expect(redisService.invalidatePattern).not.toHaveBeenCalled();
    });

    it('rejects with SALE_NOT_FOUND when the gift write reports the row is gone', async () => {
        db.getOneSale.mockResolvedValueOnce(
            saleFixture(new Date(Date.now() + 60 * 60_000), SaleStatus.PENDING),
        );
        db.giftSale.mockResolvedValueOnce(null);

        await expect(
            usecase.execute(userId, {
                saleId,
                status: 'GIFTED',
                recipientName: 'Marc',
            } as UpdateSaleDto),
        ).rejects.toMatchObject({ code: ErrorCode.SALE_NOT_FOUND });

        expect(redisService.invalidatePattern).not.toHaveBeenCalled();
    });

    it('rejects with SALE_NOT_FOUND when the gift-update write reports the row is gone', async () => {
        db.getOneSale.mockResolvedValueOnce(
            saleFixture(
                new Date(Date.now() + 60 * 60_000),
                SaleStatus.GIFTED,
                giftFixture({ recipientId: 'recipient-0' as RecipientId }),
            ),
        );
        db.updateGift.mockResolvedValueOnce(null);

        await expect(
            usecase.execute(userId, {
                saleId,
                status: 'GIFTED',
                recipientName: 'Marc',
            } as UpdateSaleDto),
        ).rejects.toMatchObject({ code: ErrorCode.SALE_NOT_FOUND });

        expect(redisService.invalidatePattern).not.toHaveBeenCalled();
    });
});
```

(`SalesCacheInvalidator` is a real provider in this spec wired to the mocked `RedisService`, so `redisService.invalidatePattern` is the observable for `afterWrite` — the same probe the existing happy-path test at line ~120 uses.)

Run: `npx vitest run src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts`
Expected: FAIL — the usecase does not yet send `currentSale`, and it ignores the not-found outcomes (the plain-update test resolves instead of rejecting; the gift test crashes destructuring `null` instead of rejecting with `SALE_NOT_FOUND`).

- [x] **Step 6: Update the usecase call sites and add the outcome checks (expect GREEN)**

In `update-sale.usecase.ts`, rewrite each of the three db call sites (lines ~83, ~97, ~109): pass `currentSale: existing` **and** check the outcome before `salesCacheInvalidator.afterWrite`:

```ts
if (target === 'GIFTED' && existing.status !== 'GIFTED') {
    const gift = await this.db.giftSale({
        ...fieldPatch,
        currentSale: existing,
        recipient: await this.resolveNewGiftRecipient(userId, payload),
    });

    if (gift == null) {
        throw new DomainException(ErrorCode.SALE_NOT_FOUND);
    }

    await this.salesCacheInvalidator.afterWrite(userId, {
        recipientChanged: true,
    });

    return;
}
```

```ts
if (targetsExistingGift) {
    const recipient = await this.resolveExistingGiftRecipient(userId, payload);
    const gift = await this.db.updateGift({
        ...fieldPatch,
        currentSale: existing,
        ...(recipient != null ? { recipient } : {}),
    });

    if (gift == null) {
        throw new DomainException(ErrorCode.SALE_NOT_FOUND);
    }
    const { recipientId } = gift;

    await this.salesCacheInvalidator.afterWrite(userId, {
        recipientChanged: recipientId !== (existing.Gift?.recipientId ?? null),
    });

    return;
}
```

```ts
const outcome = await this.db.updateSale({
    ...fieldPatch,
    currentSale: existing,
    ...(target !== undefined ? { status: target as 'PENDING' | 'SOLD' } : {}),
});

if (outcome === 'not_found') {
    throw new DomainException(ErrorCode.SALE_NOT_FOUND);
}

await this.salesCacheInvalidator.afterWrite(userId, { recipientChanged: false });
```

No other usecase logic changes: `SALE_NOT_FOUND` now has two sources in this usecase — the load-time check at lines 33-35 and the three write outcomes above — and both live here, in the service layer, mapping to 404 exactly as before (spec D1 Part B).

Run: `npx vitest run src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts`
Expected: PASS.

- [x] **Step 7: Run the full gate**

Run: `npx vitest run src/api/sales/usecases/update-sale && npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build`
Expected: all pass. The 14 pre-existing `toHaveBeenCalledWith(expect.objectContaining({...}))` assertions must pass unchanged — that property is why the snapshot rides inside the payload (spec D1). The three new not-found tests must be green; the 404 half of their wire claim is pinned by Task 2's `http-exception.mapper.spec.ts` (create it in Task 2 only — if you are running this task first, that file simply does not exist yet and `npm test` still passes).

- [ ] **Step 8: Commit** — SKIPPED by instruction: all changes left uncommitted for the user's final review.

```bash
git add src/api/sales/usecases/update-sale/
git commit -m "refactor(update-sale): pass the pre-write sale row into the write methods, drop db-layer throw"
```

---

### Task 4: users — db returns null on duplicate, service throws

**Files:**
- Modify: `src/db/users/users.db.ts`
- Modify: `src/db/users/users.db.interface.ts`
- Modify: `src/api/users/users.service.ts`
- Test: `src/db/users/users.db.spec.ts` (new)
- Test: `src/api/users/users.service.spec.ts` (new)

**Interfaces:**
- Consumes: `Prisma.PrismaClientKnownRequestError` (code `P2002`); `IAuthService.hashPassword(password: string): Promise<HashedPassword>` (already injected into `UsersService`).
- Produces: `IUsersDbService.create(payload: { email: Email; firstName: string; lastName: string; password: HashedPassword }): Promise<Users | null>` — returns the created row, `null` iff the email already exists (P2002); any other Prisma error is rethrown. `UsersService.create` throws `DomainException(ErrorCode.EMAIL_ALREADY_EXISTS)` exactly when the db returns `null`, otherwise resolves `void`.

- [x] **Step 1: Write the failing db spec (new file)**

Create `src/db/users/users.db.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Prisma, Users } from '@prisma/client';

import { UsersDb } from './users.db';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { Email, HashedPassword } from '@psg/shared/strings';

describe('UsersDb', () => {
    let usersDb: UsersDb;
    let prisma: DeepMockProxy<PrismaService>;

    const payload = {
        email: 'ada@example.com' as Email,
        firstName: 'Ada',
        lastName: 'Lovelace',
        password: 'hashed-password' as HashedPassword,
    };

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UsersDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usersDb = module.get(UsersDb);
        prisma = module.get(PrismaService);

        module.useLogger(false);
    });

    describe('create', () => {
        it('returns the row prisma created', async () => {
            const created = { id: 'user-1', ...payload } as Users;
            prisma.users.create.mockResolvedValueOnce(created);

            const result = await usersDb.create(payload);

            expect(result).toBe(created);
            expect(prisma.users.create).toHaveBeenCalledWith({ data: payload });
        });

        it('returns null when the email already exists (P2002)', async () => {
            prisma.users.create.mockRejectedValueOnce(
                new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
                    code: 'P2002',
                    clientVersion: '6.0.1',
                }),
            );

            const result = await usersDb.create(payload);

            expect(result).toBeNull();
        });

        it('rethrows any other prisma error', async () => {
            prisma.users.create.mockRejectedValueOnce(new Error('connection lost'));

            await expect(usersDb.create(payload)).rejects.toThrow('connection lost');
        });
    });
});
```

- [x] **Step 2: Run the db spec to verify RED**

Run: `npx vitest run src/db/users/users.db.spec.ts`
Expected: FAIL — current `create` returns `void` on success and throws `DomainException` on P2002 instead of returning `null`.

- [x] **Step 3: Implement the db change**

In `src/db/users/users.db.interface.ts`, change the `create` abstract's return type:

```ts
abstract create(payload: {
    email: Email;
    firstName: string;
    lastName: string;
    password: HashedPassword;
}): Promise<Users | null>;
```

(`Users` is already imported in that file.)

In `src/db/users/users.db.ts`:

1. Delete the `DomainException` and `ErrorCode` imports (lines 11-12).
2. Replace `create`:

```ts
async create(payload: {
    email: Email;
    firstName: string;
    lastName: string;
    password: HashedPassword;
}): Promise<Users | null> {
    try {
        return await this.prisma.users.create({ data: payload });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            // Unique violation on email → no row created. The db reports
            // the raw outcome; the service decides what it means.
            return null;
        }
        throw e;
    }
}
```

- [x] **Step 4: Run the db spec to verify GREEN**

Run: `npx vitest run src/db/users/users.db.spec.ts`
Expected: PASS.

- [x] **Step 5: Write the failing service spec (new file)**

Create `src/api/users/users.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Users } from '@prisma/client';

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { IUsersDbService } from '../../db/users/users.db.interface';
import { IAuthService } from '../../auth/interfaces/auth.service.interface';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import type { HashedPassword } from '@psg/shared/strings';

describe('UsersService', () => {
    let service: UsersService;
    let usersDb: DeepMockProxy<IUsersDbService>;
    let authService: DeepMockProxy<IAuthService>;

    const dto = {
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        password: 'correct-horse',
    } as CreateUserDto;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: IUsersDbService, useValue: mockDeep<IUsersDbService>() },
                { provide: IAuthService, useValue: mockDeep<IAuthService>() },
            ],
        }).compile();

        service = module.get(UsersService);
        usersDb = module.get(IUsersDbService);
        authService = module.get(IAuthService);

        module.useLogger(false);
    });

    describe('when the email is still free', () => {
        it('hashes the password and creates the user', async () => {
            authService.hashPassword.mockResolvedValueOnce('hashed' as HashedPassword);
            usersDb.create.mockResolvedValueOnce({ id: 'user-1' } as Users);

            await service.create(dto);

            expect(usersDb.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: dto.email,
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    password: 'hashed',
                }),
            );
        });

        it('resolves without a result', async () => {
            authService.hashPassword.mockResolvedValueOnce('hashed' as HashedPassword);
            usersDb.create.mockResolvedValueOnce({ id: 'user-1' } as Users);

            await expect(service.create(dto)).resolves.toBeUndefined();
        });
    });

    describe('when the email is already taken', () => {
        it('rejects with EMAIL_ALREADY_EXISTS', async () => {
            authService.hashPassword.mockResolvedValueOnce('hashed' as HashedPassword);
            usersDb.create.mockResolvedValueOnce(null);

            await expect(service.create(dto)).rejects.toMatchObject({
                code: ErrorCode.EMAIL_ALREADY_EXISTS,
            });
        });
    });
});
```

- [x] **Step 6: Run the service spec to verify RED**

Run: `npx vitest run src/api/users/users.service.spec.ts`
Expected: FAIL on `'rejects with EMAIL_ALREADY_EXISTS'` — `UsersService.create` does not throw yet.

- [x] **Step 7: Move the throw into the service**

In `src/api/users/users.service.ts`:

1. Add imports:

```ts
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
```

2. Replace `create`:

```ts
async create(payload: CreateUserDto): Promise<void> {
    const hashedPassword = await this.authService.hashPassword(payload.password);

    const created = await this.userDbService.create({
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        password: hashedPassword,
    });

    if (created == null) {
        throw new DomainException(ErrorCode.EMAIL_ALREADY_EXISTS);
    }
}
```

- [x] **Step 8: Run the service spec to verify GREEN**

Run: `npx vitest run src/api/users/users.service.spec.ts`
Expected: PASS.

- [x] **Step 9: Run the full gate**

Run: `npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build`
Expected: all pass. Note `admin.service.spec.ts` mocks `IUsersDbService` but never calls `create` — it must stay green untouched; if it fails, the interface change leaked somewhere.

- [ ] **Step 10: Commit** — SKIPPED by instruction: all changes left uncommitted for the user's final review.

```bash
git add src/db/users/ src/api/users/
git commit -m "refactor(users): return null on duplicate email in the db, throw in the service"
```

---

### Task 5 (optional): dependency-cruiser rule `no-domain-exception-in-db`

Depends on Tasks 2-4. Skippable if the team prefers convention-only — the spec marks this D4 as optional.

**Files:**
- Modify: `.dependency-cruiser.cjs`

**Interfaces:**
- Consumes: the now-clean tree (zero db-layer imports of `domain.exception.ts` / `error-codes.enum.ts` — verify with `grep -rn "domain.exception\|error-codes.enum" src/db --include="*.ts"; grep -rln "domain.exception\|error-codes.enum" src --include="*.db.ts"`).
- Produces: a new `error`-severity rule named `no-domain-exception-in-db`, enforced by `npm run lint:deps`.

- [x] **Step 1: Add the rule**

In `.dependency-cruiser.cjs`, insert as the last entry of the `forbidden` array (after `no-circular` is fine — order is irrelevant):

```js
{
    name: 'no-domain-exception-in-db',
    comment:
        'db files return raw query results or null; deciding to throw a DomainException belongs to the service/usecase (CLAUDE.md hexagonal split).',
    severity: 'error',
    from: { path: ['^src/db/', '\\.db\\.ts$'], pathNot: ['\\.spec\\.ts$'] },
    to: { path: ['^src/common/exceptions/(domain\\.exception|error-codes\\.enum)\\.ts$'] },
},
```

- [x] **Step 2: Verify the rule passes on the fixed tree**

Run: `npm run lint:deps`
Expected: PASS (no violations).

- [x] **Step 3: Verify the rule actually bites (red-green probe)**

Temporarily append `import { DomainException } from './common/exceptions/domain.exception';` to `src/db/users/users.db.ts`, then:

Run: `npm run lint:deps`
Expected: FAIL with `no-domain-exception-in-db` on `src/db/users/users.db.ts`.

Then remove the temporary import again and re-run `npm run lint:deps` → PASS.

- [x] **Step 4: Final full gate and commit** — gate ran green; commit SKIPPED by instruction (everything left uncommitted).

Run: `npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build`
Expected: all pass.

```bash
git add .dependency-cruiser.cjs
git commit -m "chore(deps): forbid DomainException and ErrorCode imports in db files"
```

---

## Post-completion checklist

- [x] Grep is clean: `grep -rn "DomainException\|error-codes.enum" src --include="*.db.ts"` and `grep -rn "DomainException\|error-codes.enum" src/db --include="*.ts"` return nothing outside `*.spec.ts`.
- [x] Outcome chain fully tested at every link: db specs prove `P2025 → 'not_found'`/`null` (no `findUnique`, no invalidation on that path), usecase specs prove `'not_found'`/`null → SALE_NOT_FOUND` (thrown before `afterWrite`), and `src/common/exceptions/http-exception.mapper.spec.ts` proves `SALE_NOT_FOUND → 404` / `EMAIL_ALREADY_EXISTS → 409`.
- [x] No new sale-row read was introduced anywhere: the `expect(prisma.sales.findUnique).not.toHaveBeenCalled()` guards pass in both db specs.
- [x] Full gate green (Task 1's command).
- [x] No file under `web/` modified; no `*.module.ts`, DTO, route, or Prisma schema modified (`git diff --stat main...HEAD` sanity check).
- [ ] `docs/tech-debt.md` optionally gains an entry for `MatchesDb.createMatch`'s silent P2002 return (spec's non-goals) — only if the team wants it recorded.
