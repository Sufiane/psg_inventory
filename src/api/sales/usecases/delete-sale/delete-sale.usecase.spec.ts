import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { DeleteSaleUsecase } from './delete-sale.usecase';
import { IDeleteSaleUsecaseDb } from './delete-sale.usecase.db';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { SalesCacheInvalidator } from '../../shared/sales-cache.invalidator';
import type { SaleId, UserId } from '@psg/shared/ids';

describe('DeleteSaleUsecase', () => {
    let usecase: DeleteSaleUsecase;
    let usecaseDb: DeepMockProxy<IDeleteSaleUsecaseDb>;
    let invalidator: DeepMockProxy<SalesCacheInvalidator>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                DeleteSaleUsecase,
                {
                    provide: IDeleteSaleUsecaseDb,
                    useValue: mockDeep<IDeleteSaleUsecaseDb>(),
                },
                {
                    provide: SalesCacheInvalidator,
                    useValue: mockDeep<SalesCacheInvalidator>(),
                },
            ],
        }).compile();

        usecase = module.get(DeleteSaleUsecase);
        usecaseDb = module.get(IDeleteSaleUsecaseDb);
        invalidator = module.get(SalesCacheInvalidator);

        module.useLogger(false);
    });

    describe('when the sale was GIFTED', () => {
        beforeEach(() => {
            usecaseDb.loadSale.mockResolvedValueOnce({
                id: saleId,
                status: SaleStatus.GIFTED,
            });
        });

        it('deletes the sale', async () => {
            await usecase.execute(userId, saleId);

            expect(usecaseDb.deleteSale).toHaveBeenCalledWith(userId, saleId);
        });

        it('invalidates caches including recipients', async () => {
            await usecase.execute(userId, saleId);

            expect(invalidator.afterWrite).toHaveBeenCalledWith(userId, saleId, {
                recipientChanged: true,
            });
        });
    });

    describe('when the sale was not GIFTED', () => {
        beforeEach(() => {
            usecaseDb.loadSale.mockResolvedValueOnce({
                id: saleId,
                status: SaleStatus.PENDING,
            });
        });

        it('deletes the sale', async () => {
            await usecase.execute(userId, saleId);

            expect(usecaseDb.deleteSale).toHaveBeenCalledWith(userId, saleId);
        });

        it('invalidates caches without recipients', async () => {
            await usecase.execute(userId, saleId);

            expect(invalidator.afterWrite).toHaveBeenCalledWith(userId, saleId, {
                recipientChanged: false,
            });
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

        it('neither deletes nor invalidates', async () => {
            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });

            expect(usecaseDb.deleteSale).not.toHaveBeenCalled();
            expect(invalidator.afterWrite).not.toHaveBeenCalled();
        });
    });

    describe('when the delete rejects', () => {
        const failure = new Error('db down');

        beforeEach(() => {
            usecaseDb.loadSale.mockResolvedValueOnce({
                id: saleId,
                status: SaleStatus.PENDING,
            });
            usecaseDb.deleteSale.mockRejectedValueOnce(failure);
        });

        it('propagates the error', async () => {
            await expect(usecase.execute(userId, saleId)).rejects.toBe(failure);
        });

        it('does not invalidate', async () => {
            await expect(usecase.execute(userId, saleId)).rejects.toBe(failure);

            expect(invalidator.afterWrite).not.toHaveBeenCalled();
        });
    });
});
