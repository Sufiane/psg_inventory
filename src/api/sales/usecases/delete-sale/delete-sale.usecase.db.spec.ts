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
