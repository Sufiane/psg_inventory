import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { SaleStatus } from '@prisma/client';

import type { MatchId, SaleId, UserId } from '@psg/shared/ids';
import { SalesDb } from './sales.db';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { Sale } from './type/sale.type';
import CACHE_KEYS from '../../redis/CACHE_KEYS';

describe('SalesDb', () => {
    const userId = 'user-1' as UserId;
    const saleId = 'sale-1' as SaleId;

    let service: SalesDb;
    let prismaService: DeepMockProxy<PrismaService>;
    let redisService: DeepMockProxy<RedisService>;

    function saleFixture(matchDate: Date, status: SaleStatus = SaleStatus.PENDING): Sale {
        return {
            id: saleId,
            userId,
            matchId: 'match-1' as never,
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
                date: matchDate,
                Opponent: { id: 'opp', name: 'Marseille' },
            },
            Allocations: [],
        } as unknown as Sale;
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                SalesDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        service = module.get(SalesDb);
        prismaService = module.get(PrismaService);
        redisService = module.get(RedisService);
        redisService.get.mockImplementation(
            async <T>(_key: unknown, _ttl: number, loader: () => Promise<T | null>) =>
                loader(),
        );

        module.useLogger(false);
    });

    describe('getOneSale', () => {
        it('queries prisma.sales.findUnique scoped to the user', async () => {
            prismaService.sales.findUnique.mockResolvedValueOnce(null);

            await service.getOneSale(userId, saleId);

            expect(prismaService.sales.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: saleId, userId },
                }),
            );
        });
    });

    describe('getSalesGrouped', () => {
        const range = { from: new Date('2026-08-01'), to: new Date('2027-07-31') };

        beforeEach(() => {
            // Make redisService.get call through to the loader callback
            (redisService.get as Mock).mockImplementation(
                (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
            );
        });

        it('splits sales into pending and terminal groups ordered by match date', async () => {
            const pendingSale1 = saleFixture(new Date('2026-09-01'), SaleStatus.PENDING);
            const pendingSale2 = saleFixture(new Date('2026-08-01'), SaleStatus.PENDING);
            const soldSale = saleFixture(new Date('2026-07-01'), SaleStatus.SOLD);
            const giftedSale = saleFixture(new Date('2026-06-01'), SaleStatus.GIFTED);
            const cancelledSale = saleFixture(
                new Date('2026-05-01'),
                SaleStatus.CANCELLED,
            );

            // Override IDs to be unique
            (pendingSale2 as { id: SaleId }).id = 'sale-2' as SaleId;
            (soldSale as { id: SaleId }).id = 'sale-3' as SaleId;
            (giftedSale as { id: SaleId }).id = 'sale-4' as SaleId;
            (cancelledSale as { id: SaleId }).id = 'sale-5' as SaleId;

            // Data in match-date-ascending order (as getSalesByRange returns from the DB)
            const allSales = [
                cancelledSale,
                giftedSale,
                soldSale,
                pendingSale2,
                pendingSale1,
            ];

            (prismaService.sales.findMany as Mock).mockResolvedValue(allSales as never);

            const result = await service.getSalesGrouped(userId, range);

            expect(result.pending).toHaveLength(2);
            expect(result.pending[0]!.id).toBe('sale-2'); // Aug 1 before Sep 1
            expect(result.pending[1]!.id).toBe(saleId); // Sep 1

            expect(result.terminal).toHaveLength(3);
            expect(result.terminal[0]!.id).toBe('sale-5'); // May 1 (cancelled)
            expect(result.terminal[1]!.id).toBe('sale-4'); // Jun 1 (gifted)
            expect(result.terminal[2]!.id).toBe('sale-3'); // Jul 1 (sold)
        });

        it('returns empty arrays when no sales exist', async () => {
            (prismaService.sales.findMany as Mock).mockResolvedValue([] as never);

            const result = await service.getSalesGrouped(userId, range);

            expect(result.pending).toHaveLength(0);
            expect(result.terminal).toHaveLength(0);
        });
    });

    describe('getSalesByMatch', () => {
        const matchId = 'match-1' as MatchId;

        it('fetches through redisService.get with the salesByMatch cache key', async () => {
            const redisService = service['redisService'] as DeepMockProxy<RedisService>;
            const fakeSales = [{ id: 's1' }] as never;
            (redisService.get as Mock).mockResolvedValue(fakeSales);

            const result = await service.getSalesByMatch(userId, matchId);

            expect(redisService.get).toHaveBeenCalledWith(
                CACHE_KEYS.salesByMatch(userId, matchId),
                expect.any(Number),
                expect.any(Function),
            );
            expect(result).toBe(fakeSales);
        });

        it('orders by createdAt asc', async () => {
            const redisService = service['redisService'] as DeepMockProxy<RedisService>;
            (redisService.get as Mock).mockImplementation(
                (_key: unknown, _ttl: unknown, loader: () => Promise<unknown>) =>
                    loader(),
            );

            await service.getSalesByMatch(userId, matchId);

            expect(prismaService.sales.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: { createdAt: 'asc' },
                }),
            );
        });
    });
});
