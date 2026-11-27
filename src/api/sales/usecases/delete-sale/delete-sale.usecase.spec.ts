import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';

import { DeleteSaleUsecase } from './delete-sale.usecase';
import { IDeleteSaleUsecaseDb } from './delete-sale.usecase.db';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { SalesCacheInvalidator } from '../../shared/sales-cache.invalidator';
import type { SaleId, UserId } from '@psg/shared/ids';

describe('DeleteSaleUsecase', () => {
    let usecase: DeleteSaleUsecase;
    let usecaseDb: DeepMockProxy<IDeleteSaleUsecaseDb>;
    let invalidator: DeepMockProxy<SalesCacheInvalidator>;
    let warnSpy: Mock<typeof Logger.prototype.warn>;

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

        warnSpy = vi.spyOn(Logger.prototype, 'warn').mockClear();
    });

    describe('when the sale exists', () => {
        beforeEach(() => {
            usecaseDb.loadSale.mockResolvedValueOnce({ id: saleId });
            usecaseDb.deleteSale.mockResolvedValueOnce({ id: saleId });
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

        it('logs a warning with the user and sale ids', async () => {
            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });

            expect(warnSpy.mock.calls[0]?.[0]).toEqual(expect.stringContaining(saleId));
            expect(warnSpy.mock.calls[0]?.[0]).toEqual(expect.stringContaining(userId));
        });
    });

    describe('when the sale vanishes before the delete', () => {
        beforeEach(() => {
            usecaseDb.loadSale.mockResolvedValueOnce({ id: saleId });
            usecaseDb.deleteSale.mockResolvedValueOnce(null);
        });

        it('rejects with SALE_NOT_FOUND', async () => {
            await expect(usecase.execute(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });
        });

        it('does not invalidate', async () => {
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

    describe('when the delete rejects', () => {
        const failure = new Error('db down');

        beforeEach(() => {
            usecaseDb.loadSale.mockResolvedValueOnce({ id: saleId });
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
