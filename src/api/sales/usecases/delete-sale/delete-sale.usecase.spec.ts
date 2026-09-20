import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { DeleteSaleUsecase } from './delete-sale.usecase';
import { IDeleteSaleUsecaseDb } from './delete-sale.usecase.db';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import type { SaleId, UserId } from '@psg/shared/ids';
import type { Sale } from '../../../../db/sales/type/sale.type';

describe('DeleteSaleUsecase', () => {
    let usecase: DeleteSaleUsecase;
    let usecaseDb: DeepMockProxy<IDeleteSaleUsecaseDb>;

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
            } as unknown as Sale);

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
