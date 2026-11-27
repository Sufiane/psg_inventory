import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { SaleStatus } from '@prisma/client';

import { UngiftSaleUsecase } from './ungift-sale.usecase';
import { IUngiftSaleUsecaseDb } from './ungift-sale.usecase.db';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import type { SaleId, UserId } from '@psg/shared/ids';
import type { ListedPrice } from '@psg/shared/money';
import { SalesCacheInvalidator } from '../../shared/sales-cache.invalidator';
import { computeProfit } from '../../shared/profit.util';
import type { Sale } from '../../../../db/sales/type/sale.type';

describe('UngiftSaleUsecase', () => {
    let usecase: UngiftSaleUsecase;
    let usecaseDb: DeepMockProxy<IUngiftSaleUsecaseDb>;
    let invalidator: DeepMockProxy<SalesCacheInvalidator>;
    let warnSpy: Mock<typeof Logger.prototype.warn>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;

    function saleFixture(status: SaleStatus, listedPrice = 100): Sale {
        return {
            id: saleId,
            userId,
            matchId: 'match-uuid',
            listedPrice,
            profit: computeProfit(listedPrice as ListedPrice),
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
                {
                    provide: IUngiftSaleUsecaseDb,
                    useValue: mockDeep<IUngiftSaleUsecaseDb>(),
                },
                {
                    provide: SalesCacheInvalidator,
                    useValue: mockDeep<SalesCacheInvalidator>(),
                },
            ],
        }).compile();

        usecase = module.get(UngiftSaleUsecase);
        usecaseDb = module.get(IUngiftSaleUsecaseDb);
        invalidator = module.get(SalesCacheInvalidator);

        module.useLogger(false);

        warnSpy = vi.spyOn(Logger.prototype, 'warn').mockClear();
    });

    describe('when the sale is GIFTED', () => {
        it('delegates the loaded row to the usecase db layer', async () => {
            const loaded = saleFixture(SaleStatus.GIFTED);
            usecaseDb.loadSale.mockResolvedValueOnce(loaded);
            usecaseDb.ungiftSale.mockResolvedValueOnce('written');

            await usecase.execute(userId, saleId);

            expect(usecaseDb.ungiftSale).toHaveBeenCalledWith(
                userId,
                saleId,
                loaded,
                undefined,
            );
        });

        it('invalidates caches including recipients', async () => {
            usecaseDb.loadSale.mockResolvedValueOnce(saleFixture(SaleStatus.GIFTED));
            usecaseDb.ungiftSale.mockResolvedValueOnce('written');

            await usecase.execute(userId, saleId);

            expect(invalidator.afterWrite).toHaveBeenCalledWith(userId, saleId, {
                recipientChanged: true,
            });
        });
    });

    describe('when the row is deleted between the load and the write', () => {
        beforeEach(() => {
            usecaseDb.loadSale.mockResolvedValueOnce(saleFixture(SaleStatus.GIFTED));
            usecaseDb.ungiftSale.mockResolvedValueOnce('not_found');
        });

        it('rejects with SALE_NOT_FOUND', async () => {
            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });
            expect(invalidator.afterWrite).not.toHaveBeenCalled();
        });

        it('logs a warning with the user and sale ids', async () => {
            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });

            expect(warnSpy.mock.calls[0]?.[0]).toEqual(expect.stringContaining(saleId));
            expect(warnSpy.mock.calls[0]?.[0]).toEqual(expect.stringContaining(userId));
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
        beforeEach(() => {
            usecaseDb.loadSale.mockResolvedValueOnce(null);
        });

        it('rejects with SALE_NOT_FOUND', async () => {
            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });
        });

        it('logs a warning with the user and sale ids', async () => {
            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });

            expect(warnSpy.mock.calls[0]?.[0]).toEqual(expect.stringContaining(saleId));
            expect(warnSpy.mock.calls[0]?.[0]).toEqual(expect.stringContaining(userId));
        });
    });

    describe('when the stored price is 0', () => {
        beforeEach(() => {
            usecaseDb.loadSale.mockResolvedValueOnce(saleFixture(SaleStatus.GIFTED, 0));
            usecaseDb.ungiftSale.mockResolvedValueOnce('written');
        });

        describe('and no price is given', () => {
            it('rejects with SALE_LISTED_PRICE_REQUIRED', async () => {
                await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                    code: ErrorCode.SALE_LISTED_PRICE_REQUIRED,
                });
                expect(usecaseDb.ungiftSale).not.toHaveBeenCalled();
            });
        });

        describe('and a price is given', () => {
            it('writes the price and its profit', async () => {
                const price = 120 as ListedPrice;

                await usecase.execute(userId, saleId, price);

                expect(usecaseDb.ungiftSale).toHaveBeenCalledWith(
                    userId,
                    saleId,
                    expect.objectContaining({ listedPrice: 0 }),
                    { listedPrice: price, profit: computeProfit(price) },
                );
            });
        });
    });

    describe('when the stored price is above 0', () => {
        beforeEach(() => {
            usecaseDb.loadSale.mockResolvedValueOnce(saleFixture(SaleStatus.GIFTED, 90));
        });

        describe('and a price is given', () => {
            it('rejects with SALE_LISTED_PRICE_NOT_APPLICABLE', async () => {
                await expect(
                    usecase.execute(userId, saleId, 120 as ListedPrice),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_LISTED_PRICE_NOT_APPLICABLE,
                });
                expect(usecaseDb.ungiftSale).not.toHaveBeenCalled();
            });
        });
    });
});
