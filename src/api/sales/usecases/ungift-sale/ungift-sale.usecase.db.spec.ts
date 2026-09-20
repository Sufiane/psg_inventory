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
