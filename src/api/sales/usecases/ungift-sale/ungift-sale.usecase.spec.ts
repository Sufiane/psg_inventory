import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { UngiftSaleUsecase } from './ungift-sale.usecase';
import { IUngiftSaleUsecaseDb } from './ungift-sale.usecase.db';
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
                {
                    provide: IUngiftSaleUsecaseDb,
                    useValue: mockDeep<IUngiftSaleUsecaseDb>(),
                },
            ],
        }).compile();

        usecase = module.get(UngiftSaleUsecase);
        usecaseDb = module.get(IUngiftSaleUsecaseDb);

        module.useLogger(false);
    });

    describe('when the sale is GIFTED', () => {
        it('delegates the loaded row to the usecase db layer', async () => {
            const loaded = saleFixture(SaleStatus.GIFTED);
            usecaseDb.loadSale.mockResolvedValueOnce(loaded);
            usecaseDb.ungiftSale.mockResolvedValueOnce('written');

            await usecase.execute(userId, saleId);

            expect(usecaseDb.ungiftSale).toHaveBeenCalledWith(userId, saleId, loaded);
        });
    });

    describe('when the row is deleted between the load and the write', () => {
        it('rejects with SALE_NOT_FOUND', async () => {
            usecaseDb.loadSale.mockResolvedValueOnce(saleFixture(SaleStatus.GIFTED));
            usecaseDb.ungiftSale.mockResolvedValueOnce('not_found');

            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });
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
