# Extract `ungiftSale` and `deleteSale` into Usecases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `ungiftSale` and `deleteSale` from `SalesService` into dedicated usecases under `src/api/sales/usecases/`, establishing the usecase pattern while the blast radius is small.

**Architecture:** Each usecase gets its own directory with a business-logic file (`*.usecase.ts`), a colocated db layer (`*.usecase.db.ts`), and a spec per layer. `SalesService` becomes a thin facade that delegates to the usecases. The controller and script contracts are unchanged.

**Tech Stack:** NestJS, Prisma, Redis, Jest

**Spec:** `docs/specs/2026-09-20-psg-16-ungift-delete-usecase-extraction-design.md`

## Global Constraints

- No tsconfig changes. The current setup is load-bearing: root `include` is `["src/**/*", "scripts/**/*"]`, and `tsconfig.build.json`'s `"exclude"` keeps the output at `dist/main.js`.
- No runtime behavior change — net-zero refactor.
- No database migration.
- `*.usecase.db.ts` files are already exempted from the `no-orm-outside-db` dependency-cruiser rule.
- `SalesModule` already imports `RedisModule`, so `RedisService` is injectable in all providers registered by that module (including the new usecase db classes).
- Follow the existing naming convention: `FooDb` for db classes, `IFooDbService` for tokens, `FooUsecase` for usecase classes.

## File Map

### Created (8 files)

| File | Purpose |
|---|---|
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.ts` | `IUngiftSaleUsecase` token + `UngiftSaleUsecase` class |
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.ts` | `IUngiftSaleUsecaseDb` token + `UngiftSaleUsecaseDb` class |
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts` | Business logic tests (3 tests) |
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts` | Db-layer tests (2 tests) |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.ts` | `IDeleteSaleUsecase` token + `DeleteSaleUsecase` class |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.db.ts` | `IDeleteSaleUsecaseDb` token + `DeleteSaleUsecaseDb` class |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.spec.ts` | Business logic tests (2 tests) |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.db.spec.ts` | Db-layer tests (4 tests) |

### Modified (3 files)

| File | Change |
|---|---|
| `src/api/sales/sales.service.ts` | Remove `ungiftSale` and `deleteSale` method bodies; replace with delegation. Add usecase tokens to constructor. |
| `src/api/sales/sales.service.spec.ts` | Remove `ungiftSale` and `deleteSale` describe blocks. Add thin delegation tests. |
| `src/api/sales/sales.module.ts` | Add usecase tokens and classes to `providers`. |

---

## Task 1: Create the UngiftSale usecase db layer

**Files:**
- Create: `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.ts`
- Test: `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts`

**Interfaces:**
- Consumes: `ISalesDbService` (existing), `RedisService` (existing)
- Produces: `IUngiftSaleUsecaseDb` token with `loadSale(userId, saleId)` and `ungiftSale(userId, saleId)`

- [ ] **Step 1: Write the failing db-layer spec**

```ts
// src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { UngiftSaleUsecaseDb } from './ungift-sale.usecase.db';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import type { SaleId, UserId } from '@psg/shared/ids';
import type { Sale } from '../../../../db/sales/type/sale.type';
import { SaleStatus } from '@prisma/client';

describe('UngiftSaleUsecaseDb', () => {
    let usecaseDb: UngiftSaleUsecaseDb;
    let salesDbService: DeepMockProxy<ISalesDbService>;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UngiftSaleUsecaseDb,
                { provide: ISalesDbService, useValue: mockDeep<ISalesDbService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usecaseDb = module.get(UngiftSaleUsecaseDb);
        salesDbService = module.get(ISalesDbService);
        redisService = module.get(RedisService);

        module.useLogger(false);
    });

    describe('loadSale', () => {
        it('delegates to salesDbService.getOneSale', async () => {
            const sale = { id: saleId, status: SaleStatus.GIFTED } as Sale;
            salesDbService.getOneSale.mockResolvedValueOnce(sale);

            const result = await usecaseDb.loadSale(userId, saleId);

            expect(result).toBe(sale);
            expect(salesDbService.getOneSale).toHaveBeenCalledWith(userId, saleId);
        });
    });

    describe('ungiftSale', () => {
        it('calls salesDbService.ungiftSale and invalidates both caches', async () => {
            await usecaseDb.ungiftSale(userId, saleId);

            expect(salesDbService.ungiftSale).toHaveBeenCalledWith(userId, saleId);
            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateAccounting(userId),
            );
            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        });
    });
});
```

- [ ] **Step 2: Run spec to verify it fails**

Run: `npx jest src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts --no-coverage`
Expected: FAIL — module cannot resolve `UngiftSaleUsecaseDb`

- [ ] **Step 3: Write the db-layer implementation**

```ts
// src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.ts
import { Injectable } from '@nestjs/common';

import type { SaleId, UserId } from '@psg/shared/ids';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { Sale } from '../../../../db/sales/type/sale.type';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';

export abstract class IUngiftSaleUsecaseDb {
    abstract loadSale(userId: UserId, saleId: SaleId): Promise<Sale | null>;
    abstract ungiftSale(userId: UserId, saleId: SaleId): Promise<void>;
}

@Injectable()
export class UngiftSaleUsecaseDb implements IUngiftSaleUsecaseDb {
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly redisService: RedisService,
    ) {}

    async loadSale(userId: UserId, saleId: SaleId): Promise<Sale | null> {
        return this.salesDbService.getOneSale(userId, saleId);
    }

    async ungiftSale(userId: UserId, saleId: SaleId): Promise<void> {
        await this.salesDbService.ungiftSale(userId, saleId);

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateRecipients(userId),
        );
    }
}
```

- [ ] **Step 4: Run spec to verify it passes**

Run: `npx jest src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts --no-coverage`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.ts src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts
git commit -m "feat(sales): add UngiftSaleUsecaseDb with load and ungift + cache invalidation"
```

---

## Task 2: Create the UngiftSale business-logic usecase

**Files:**
- Create: `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.ts`
- Test: `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts`

**Interfaces:**
- Consumes: `IUngiftSaleUsecaseDb` (from Task 1)
- Produces: `IUngiftSaleUsecase` token with `execute(userId, saleId)`

- [ ] **Step 1: Write the failing business-logic spec**

```ts
// src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { UngiftSaleUsecase } from './ungift-sale.usecase';
import { IUngiftSaleUsecaseDb } from './ungift-sale.usecase.db';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import type { SaleId, UserId } from '@psg/shared/ids';
import type { Sale } from '../../../../db/sales/type/sale.type';

describe('UngiftSaleUsecase', () => {
    let usecase: UngiftSaleUsecase;
    let usecaseDb: DeepMockProxy<IUngiftSaleUsecaseDb>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;

    function saleFixture(status: SaleStatus): Sale {
        return {
            id: saleId,
            userId,
            matchId: 'match-uuid',
            listedPrice: 100,
            profit: 90,
            invest: 50,
            nbTickets: 1,
            status,
            createdAt: new Date(),
            updatedAt: new Date(),
            soldAt: null,
            cancelledAt: null,
            Gift: null,
            Match: {
                date: new Date(Date.now() - 86_400_000),
                Opponent: { id: 'opp', name: 'Marseille' },
            },
            Allocations: [],
        } as unknown as Sale;
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UngiftSaleUsecase,
                { provide: IUngiftSaleUsecaseDb, useValue: mockDeep<IUngiftSaleUsecaseDb>() },
            ],
        }).compile();

        usecase = module.get(UngiftSaleUsecase);
        usecaseDb = module.get(IUngiftSaleUsecaseDb);

        module.useLogger(false);
    });

    describe('when the sale is GIFTED', () => {
        it('delegates to the usecase db layer', async () => {
            usecaseDb.loadSale.mockResolvedValueOnce(saleFixture(SaleStatus.GIFTED));

            await usecase.execute(userId, saleId);

            expect(usecaseDb.ungiftSale).toHaveBeenCalledWith(userId, saleId);
        });
    });

    describe('when the sale is not GIFTED', () => {
        it('rejects with SALE_INVALID_STATUS_TRANSITION', async () => {
            usecaseDb.loadSale.mockResolvedValueOnce(saleFixture(SaleStatus.PENDING));

            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_INVALID_STATUS_TRANSITION,
            });
            expect(usecaseDb.ungiftSale).not.toHaveBeenCalled();
        });
    });

    describe('when the sale does not exist', () => {
        it('rejects with SALE_NOT_FOUND', async () => {
            usecaseDb.loadSale.mockResolvedValueOnce(null);

            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });
        });
    });
});
```

- [ ] **Step 2: Run spec to verify it fails**

Run: `npx jest src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts --no-coverage`
Expected: FAIL — module cannot resolve `UngiftSaleUsecase`

- [ ] **Step 3: Write the business-logic implementation**

```ts
// src/api/sales/usecases/ungift-sale/ungift-sale.usecase.ts
import { Injectable } from '@nestjs/common';

import type { SaleId, UserId } from '@psg/shared/ids';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { IUngiftSaleUsecaseDb } from './ungift-sale.usecase.db';

export abstract class IUngiftSaleUsecase {
    abstract execute(userId: UserId, saleId: SaleId): Promise<void>;
}

@Injectable()
export class UngiftSaleUsecase implements IUngiftSaleUsecase {
    constructor(private readonly usecaseDb: IUngiftSaleUsecaseDb) {}

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
}
```

- [ ] **Step 4: Run spec to verify it passes**

Run: `npx jest src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts --no-coverage`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/sales/usecases/ungift-sale/ungift-sale.usecase.ts src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts
git commit -m "feat(sales): add UngiftSaleUsecase with validation and delegation"
```

---

## Task 3: Create the DeleteSale usecase db layer

**Files:**
- Create: `src/api/sales/usecases/delete-sale/delete-sale.usecase.db.ts`
- Test: `src/api/sales/usecases/delete-sale/delete-sale.usecase.db.spec.ts`

**Interfaces:**
- Consumes: `ISalesDbService` (existing), `RedisService` (existing)
- Produces: `IDeleteSaleUsecaseDb` token with `loadSale(userId, saleId)` and `deleteSale(userId, saleId, saleStatus)`

- [ ] **Step 1: Write the failing db-layer spec**

```ts
// src/api/sales/usecases/delete-sale/delete-sale.usecase.db.spec.ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { DeleteSaleUsecaseDb } from './delete-sale.usecase.db';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import type { SaleId, UserId } from '@psg/shared/ids';
import type { Sale } from '../../../../db/sales/type/sale.type';

describe('DeleteSaleUsecaseDb', () => {
    let usecaseDb: DeleteSaleUsecaseDb;
    let salesDbService: DeepMockProxy<ISalesDbService>;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                DeleteSaleUsecaseDb,
                { provide: ISalesDbService, useValue: mockDeep<ISalesDbService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usecaseDb = module.get(DeleteSaleUsecaseDb);
        salesDbService = module.get(ISalesDbService);
        redisService = module.get(RedisService);

        module.useLogger(false);
    });

    describe('loadSale', () => {
        it('delegates to salesDbService.getOneSale', async () => {
            const sale = { id: saleId, status: SaleStatus.PENDING } as Sale;
            salesDbService.getOneSale.mockResolvedValueOnce(sale);

            const result = await usecaseDb.loadSale(userId, saleId);

            expect(result).toBe(sale);
            expect(salesDbService.getOneSale).toHaveBeenCalledWith(userId, saleId);
        });
    });

    describe('deleteSale', () => {
        it('always invalidates the accounting cache', async () => {
            await usecaseDb.deleteSale(userId, saleId, SaleStatus.PENDING);

            expect(salesDbService.deleteSale).toHaveBeenCalledWith(userId, saleId);
            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateAccounting(userId),
            );
        });

        it('invalidates the recipients cache when the sale was GIFTED', async () => {
            await usecaseDb.deleteSale(userId, saleId, SaleStatus.GIFTED);

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        });

        it('does not invalidate the recipients cache when the sale was not GIFTED', async () => {
            await usecaseDb.deleteSale(userId, saleId, SaleStatus.PENDING);

            expect(redisService.invalidatePattern).not.toHaveBeenCalledWith(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        });
    });
});
```

- [ ] **Step 2: Run spec to verify it fails**

Run: `npx jest src/api/sales/usecases/delete-sale/delete-sale.usecase.db.spec.ts --no-coverage`
Expected: FAIL — module cannot resolve `DeleteSaleUsecaseDb`

- [ ] **Step 3: Write the db-layer implementation**

```ts
// src/api/sales/usecases/delete-sale/delete-sale.usecase.db.ts
import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';

import type { SaleId, UserId } from '@psg/shared/ids';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { Sale } from '../../../../db/sales/type/sale.type';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';

export abstract class IDeleteSaleUsecaseDb {
    abstract loadSale(userId: UserId, saleId: SaleId): Promise<Sale | null>;
    abstract deleteSale(userId: UserId, saleId: SaleId, saleStatus: SaleStatus): Promise<void>;
}

@Injectable()
export class DeleteSaleUsecaseDb implements IDeleteSaleUsecaseDb {
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly redisService: RedisService,
    ) {}

    async loadSale(userId: UserId, saleId: SaleId): Promise<Sale | null> {
        return this.salesDbService.getOneSale(userId, saleId);
    }

    async deleteSale(userId: UserId, saleId: SaleId, saleStatus: SaleStatus): Promise<void> {
        await this.salesDbService.deleteSale(userId, saleId);

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );

        // Deleting a GIFTED sale destroys its gift row with it (ON DELETE
        // CASCADE plus the explicit delete in the db layer), which moves the
        // recipient's giftCount — the combobox's sort key.
        if (saleStatus === SaleStatus.GIFTED) {
            await this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        }
    }
}
```

- [ ] **Step 4: Run spec to verify it passes**

Run: `npx jest src/api/sales/usecases/delete-sale/delete-sale.usecase.db.spec.ts --no-coverage`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/sales/usecases/delete-sale/delete-sale.usecase.db.ts src/api/sales/usecases/delete-sale/delete-sale.usecase.db.spec.ts
git commit -m "feat(sales): add DeleteSaleUsecaseDb with delete + conditional cache invalidation"
```

---

## Task 4: Create the DeleteSale business-logic usecase

**Files:**
- Create: `src/api/sales/usecases/delete-sale/delete-sale.usecase.ts`
- Test: `src/api/sales/usecases/delete-sale/delete-sale.usecase.spec.ts`

**Interfaces:**
- Consumes: `IDeleteSaleUsecaseDb` (from Task 3)
- Produces: `IDeleteSaleUsecase` token with `execute(userId, saleId)`

- [ ] **Step 1: Write the failing business-logic spec**

```ts
// src/api/sales/usecases/delete-sale/delete-sale.usecase.spec.ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { DeleteSaleUsecase } from './delete-sale.usecase';
import { IDeleteSaleUsecaseDb } from './delete-sale.usecase.db';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import type { SaleId, UserId } from '@psg/shared/ids';

describe('DeleteSaleUsecase', () => {
    let usecase: DeleteSaleUsecase;
    let usecaseDb: DeepMockProxy<IDeleteSaleUsecaseDb>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                DeleteSaleUsecase,
                { provide: IDeleteSaleUsecaseDb, useValue: mockDeep<IDeleteSaleUsecaseDb>() },
            ],
        }).compile();

        usecase = module.get(DeleteSaleUsecase);
        usecaseDb = module.get(IDeleteSaleUsecaseDb);

        module.useLogger(false);
    });

    describe('when the sale exists', () => {
        it('delegates to the usecase db layer with the sale status', async () => {
            usecaseDb.loadSale.mockResolvedValueOnce({
                id: saleId,
                userId,
                status: 'GIFTED',
            } as any);

            await usecase.execute(userId, saleId);

            expect(usecaseDb.deleteSale).toHaveBeenCalledWith(userId, saleId, 'GIFTED');
        });
    });

    describe('when the sale does not exist', () => {
        it('rejects with SALE_NOT_FOUND', async () => {
            usecaseDb.loadSale.mockResolvedValueOnce(null);

            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });
            expect(usecaseDb.deleteSale).not.toHaveBeenCalled();
        });
    });
});
```

- [ ] **Step 2: Run spec to verify it fails**

Run: `npx jest src/api/sales/usecases/delete-sale/delete-sale.usecase.spec.ts --no-coverage`
Expected: FAIL — module cannot resolve `DeleteSaleUsecase`

- [ ] **Step 3: Write the business-logic implementation**

```ts
// src/api/sales/usecases/delete-sale/delete-sale.usecase.ts
import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';

import type { SaleId, UserId } from '@psg/shared/ids';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { IDeleteSaleUsecaseDb } from './delete-sale.usecase.db';

export abstract class IDeleteSaleUsecase {
    abstract execute(userId: UserId, saleId: SaleId): Promise<void>;
}

@Injectable()
export class DeleteSaleUsecase implements IDeleteSaleUsecase {
    constructor(private readonly usecaseDb: IDeleteSaleUsecaseDb) {}

    async execute(userId: UserId, saleId: SaleId): Promise<void> {
        const existing = await this.usecaseDb.loadSale(userId, saleId);

        if (!existing) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        await this.usecaseDb.deleteSale(userId, saleId, existing.status as SaleStatus);
    }
}
```

- [ ] **Step 4: Run spec to verify it passes**

Run: `npx jest src/api/sales/usecases/delete-sale/delete-sale.usecase.spec.ts --no-coverage`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/sales/usecases/delete-sale/delete-sale.usecase.ts src/api/sales/usecases/delete-sale/delete-sale.usecase.spec.ts
git commit -m "feat(sales): add DeleteSaleUsecase with validation and delegation"
```

---

## Task 5: Wire usecases into SalesModule and SalesService

**Files:**
- Modify: `src/api/sales/sales.module.ts`
- Modify: `src/api/sales/sales.service.ts`

**Interfaces:**
- Consumes: `IUngiftSaleUsecase`, `IDeleteSaleUsecase` (from Tasks 2, 4)
- Produces: `SalesService` delegates to usecases; module registers new providers

- [ ] **Step 1: Add usecase imports to SalesService**

In `src/api/sales/sales.service.ts`, add imports at the top:

```ts
import { IUngiftSaleUsecase } from './usecases/ungift-sale/ungift-sale.usecase';
import { IDeleteSaleUsecase } from './usecases/delete-sale/delete-sale.usecase';
```

- [ ] **Step 2: Add usecase tokens to the SalesService constructor**

Replace the constructor:

```ts
constructor(
    private readonly salesDbService: ISalesDbService,
    private readonly matchesDbService: IMatchesDbService,
    private readonly seasonPassesDbService: ISeasonPassesDbService,
    private readonly recipientsDbService: IRecipientsDbService,
    private readonly redisService: RedisService,
    private readonly ungiftSaleUsecase: IUngiftSaleUsecase,
    private readonly deleteSaleUsecase: IDeleteSaleUsecase,
) {}
```

- [ ] **Step 3: Replace ungiftSale method body with delegation**

Replace lines 269–283:

```ts
async ungiftSale(userId: UserId, saleId: SaleId): Promise<void> {
    return this.ungiftSaleUsecase.execute(userId, saleId);
}
```

- [ ] **Step 4: Replace deleteSale method body with delegation**

Replace lines 285–300:

```ts
async deleteSale(userId: UserId, saleId: SaleId): Promise<void> {
    return this.deleteSaleUsecase.execute(userId, saleId);
}
```

- [ ] **Step 5: Register usecases in SalesModule**

In `src/api/sales/sales.module.ts`, add imports and providers:

```ts
import { IUngiftSaleUsecase, UngiftSaleUsecase } from './usecases/ungift-sale/ungift-sale.usecase';
import { IUngiftSaleUsecaseDb, UngiftSaleUsecaseDb } from './usecases/ungift-sale/ungift-sale.usecase.db';
import { IDeleteSaleUsecase, DeleteSaleUsecase } from './usecases/delete-sale/delete-sale.usecase';
import { IDeleteSaleUsecaseDb, DeleteSaleUsecaseDb } from './usecases/delete-sale/delete-sale.usecase.db';

@Module({
    imports: [
        SalesDbModule,
        MatchesDbModule,
        SeasonPassesDbModule,
        RecipientsDbModule,
        RedisModule,
    ],
    controllers: [SalesController],
    providers: [
        { provide: ISalesService, useClass: SalesService },
        { provide: IUngiftSaleUsecaseDb, useClass: UngiftSaleUsecaseDb },
        { provide: IUngiftSaleUsecase, useClass: UngiftSaleUsecase },
        { provide: IDeleteSaleUsecaseDb, useClass: DeleteSaleUsecaseDb },
        { provide: IDeleteSaleUsecase, useClass: DeleteSaleUsecase },
    ],
})
export class SalesModule {}
```

- [ ] **Step 6: Run typecheck to verify wiring**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors

- [ ] **Step 7: Commit**

```bash
git add src/api/sales/sales.module.ts src/api/sales/sales.service.ts
git commit -m "feat(sales): wire UngiftSaleUsecase and DeleteSaleUsecase into module and service"
```

---

## Task 6: Update SalesService tests

**Files:**
- Modify: `src/api/sales/sales.service.spec.ts`

**Interfaces:**
- Consumes: `IUngiftSaleUsecase`, `IDeleteSaleUsecase` (registered in module)

- [ ] **Step 1: Add usecase imports to test file**

At the top of `src/api/sales/sales.service.spec.ts`, add:

```ts
import { IUngiftSaleUsecase } from './usecases/ungift-sale/ungift-sale.usecase';
import { IDeleteSaleUsecase } from './usecases/delete-sale/delete-sale.usecase';
```

- [ ] **Step 2: Add usecase mocks to test module setup**

In the `beforeEach` block, add to `providers`:

```ts
{ provide: IUngiftSaleUsecase, useValue: mockDeep<UngiftSaleUsecase>() },
{ provide: IDeleteSaleUsecase, useValue: mockDeep<DeleteSaleUsecase>() },
```

And after the existing `module.get` calls, add:

```ts
const ungiftSaleUsecase = module.get(IUngiftSaleUsecase);
const deleteSaleUsecase = module.get(IDeleteSaleUsecase);
```

- [ ] **Step 3: Remove the old ungiftSale and deleteSale test blocks**

Remove lines 914–956 (ungiftSale describe block) and lines 1083–1166 (deleteSale describe block).

- [ ] **Step 4: Add thin delegation tests**

```ts
describe('ungiftSale', () => {
    it('delegates to UngiftSaleUsecase.execute', async () => {
        await service.ungiftSale(userId, saleId);

        expect(ungiftSaleUsecase.execute).toHaveBeenCalledWith(userId, saleId);
    });
});

describe('deleteSale', () => {
    it('delegates to DeleteSaleUsecase.execute', async () => {
        await service.deleteSale(userId, saleId);

        expect(deleteSaleUsecase.execute).toHaveBeenCalledWith(userId, saleId);
    });
});
```

- [ ] **Step 5: Run the updated spec**

Run: `npx jest src/api/sales/sales.service.spec.ts --no-coverage`
Expected: PASS — all tests pass, including the new delegation tests

- [ ] **Step 6: Commit**

```bash
git add src/api/sales/sales.service.spec.ts
git commit -m "test(sales): replace ungiftSale/deleteSale tests with delegation tests"
```

---

## Task 7: Full verification

**Files:** None — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npx jest --no-coverage`
Expected: PASS — all tests pass

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run linter**

Run: `npx eslint src/api/sales/`
Expected: PASS

- [ ] **Step 4: Run dependency-cruiser**

Run: `npx depcruise src --config`
Expected: PASS — `*.usecase.db.ts` files are already exempted

- [ ] **Step 5: Run build**

Run: `npm run build && test -f dist/main.js`
Expected: PASS — `dist/main.js` exists

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(sales): address review feedback on usecase extraction"
```
