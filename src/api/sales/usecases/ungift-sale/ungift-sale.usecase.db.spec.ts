import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { Prisma, SaleStatus } from '@prisma/client';

import { UngiftSaleUsecaseDb } from './ungift-sale.usecase.db';
import { PrismaService } from '../../../../db/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import type { SaleId, UserId } from '@psg/shared/ids';

describe('UngiftSaleUsecaseDb', () => {
    let usecaseDb: UngiftSaleUsecaseDb;
    let prisma: DeepMockProxy<PrismaService>;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UngiftSaleUsecaseDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usecaseDb = module.get(UngiftSaleUsecaseDb);
        prisma = module.get(PrismaService);
        redisService = module.get(RedisService);

        module.useLogger(false);
    });

    function mockTransaction(): DeepMockProxy<Prisma.TransactionClient> {
        const tx = mockDeep<Prisma.TransactionClient>();

        (prisma.$transaction as Mock).mockImplementation(
            (callback: (tx: Prisma.TransactionClient) => unknown) => callback(tx),
        );

        return tx;
    }

    describe('loadSale', () => {
        it('queries prisma.sales.findUnique with userId and saleId', async () => {
            const expected = { id: saleId, status: SaleStatus.GIFTED };
            prisma.sales.findUnique.mockResolvedValueOnce(expected as never);

            const result = await usecaseDb.loadSale(userId, saleId);

            expect(result).toEqual(expected);
            expect(prisma.sales.findUnique).toHaveBeenCalledWith({
                where: { userId, id: saleId },
                select: { id: true, status: true },
            });
        });

        it('returns null when the sale does not exist', async () => {
            prisma.sales.findUnique.mockResolvedValueOnce(null);

            const result = await usecaseDb.loadSale(userId, saleId);

            expect(result).toBeNull();
        });
    });

    describe('ungiftSale', () => {
        const currentSale = {
            id: saleId,
            userId,
            status: SaleStatus.GIFTED,
            listedPrice: 100,
            profit: 90,
            invest: 50,
            nbTickets: 1,
            matchId: 'match-uuid',
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-02'),
            soldAt: null,
            cancelledAt: null,
        };

        beforeEach(() => {
            prisma.sales.findUnique.mockResolvedValue(currentSale as never);
        });

        it('throws SALE_NOT_FOUND when the sale does not exist', async () => {
            prisma.sales.findUnique.mockResolvedValueOnce(null);

            await expect(usecaseDb.ungiftSale(userId, saleId)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });
        });

        it('deletes gift rows, resets sale to PENDING, and creates history in one transaction', async () => {
            const tx = mockTransaction();

            await usecaseDb.ungiftSale(userId, saleId);

            // Gift rows deleted first (Postgres order constraint D15)
            expect(tx.gifts.deleteMany).toHaveBeenCalledWith({ where: { saleId } });

            // Sale status reset to PENDING (profit left unchanged —
            // undefined was stripped by shake() in the original)
            expect(tx.sales.update).toHaveBeenCalledWith({
                data: {
                    status: SaleStatus.PENDING,
                },
                where: { id: saleId, userId },
            });

            // History entry captures the pre-write state
            expect(tx.saleHistories.create).toHaveBeenCalledWith({
                data: {
                    saleId: currentSale.id,
                    listedPrice: currentSale.listedPrice,
                    profit: currentSale.profit,
                    status: currentSale.status,
                },
            });
        });

        it('invalidates all four cache namespaces', async () => {
            mockTransaction();

            await usecaseDb.ungiftSale(userId, saleId);

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateSales(userId),
            );
            expect(redisService.invalidate).toHaveBeenCalledWith(CACHE_KEYS.sale(saleId));
            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateAccounting(userId),
            );
            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        });
    });
});
