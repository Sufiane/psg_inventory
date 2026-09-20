import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { Prisma, SaleStatus } from '@prisma/client';

import type { MatchId, RecipientId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import type { TicketCount } from '@psg/shared/counts';
import { SalesImportDb } from './sales-import.db';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { IRecipientsDbService } from '../recipients/recipients.db.interface';
import { RecipientsDb } from '../recipients/recipients.db';
import { BulkSaleInput } from './sales-import.db.interface';

describe('SalesImportDb', () => {
    const userId = 'user-1' as UserId;
    const matchId = 'match-1' as MatchId;

    let service: SalesImportDb;
    let prismaService: DeepMockProxy<PrismaService>;
    let redisService: DeepMockProxy<RedisService>;
    let recipientsDbService: DeepMockProxy<RecipientsDb>;

    function mockTransaction(): DeepMockProxy<Prisma.TransactionClient> {
        const tx = mockDeep<Prisma.TransactionClient>();

        (prismaService.$transaction as Mock).mockImplementation(
            (callback: (tx: Prisma.TransactionClient) => unknown) => callback(tx),
        );

        return tx;
    }

    function baseSaleInput(overrides: Partial<BulkSaleInput> = {}): BulkSaleInput {
        return {
            matchId,
            listedPrice: 100 as ListedPrice,
            invest: 0 as Invest,
            profit: 90 as Profit,
            nbTickets: 1 as TicketCount,
            status: SaleStatus.SOLD,
            soldAt: new Date('2026-03-01'),
            gift: null,
            allocations: [],
            ...overrides,
        };
    }

    function giftedSaleInput(overrides: Partial<BulkSaleInput> = {}): BulkSaleInput {
        return baseSaleInput({
            status: SaleStatus.GIFTED,
            soldAt: null,
            gift: {
                recipientName: 'Marc',
                giftedAt: new Date('2026-03-01T12:00:00.000Z'),
            },
            ...overrides,
        });
    }

    function soldSaleInput(overrides: Partial<BulkSaleInput> = {}): BulkSaleInput {
        return baseSaleInput(overrides);
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                SalesImportDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
                {
                    provide: IRecipientsDbService,
                    useValue: mockDeep<RecipientsDb>(),
                },
            ],
        }).compile();

        service = module.get(SalesImportDb);
        prismaService = module.get(PrismaService);
        redisService = module.get(RedisService);
        recipientsDbService = module.get(IRecipientsDbService);

        module.useLogger(false);
    });

    describe('bulkCreate', () => {
        describe('when a committed row is GIFTED', () => {
            it('resolves the recipient on the same transaction as the sale write', async () => {
                const tx = mockTransaction();

                (tx.sales.create as Mock).mockResolvedValue({ id: 'sale-1' });
                recipientsDbService.findOrCreateForUser.mockResolvedValue({
                    id: 'recipient-1' as RecipientId,
                } as never);

                await service.bulkCreate({
                    userId,
                    batchId: 'batch-1',
                    sales: [giftedSaleInput()],
                });

                expect(recipientsDbService.findOrCreateForUser).toHaveBeenCalledWith(
                    userId,
                    'Marc',
                    tx,
                );
            });

            it('creates the gift row alongside the sale, in the same transaction', async () => {
                const tx = mockTransaction();

                (tx.sales.create as Mock).mockResolvedValue({ id: 'sale-1' });
                recipientsDbService.findOrCreateForUser.mockResolvedValue({
                    id: 'recipient-1' as RecipientId,
                } as never);

                await service.bulkCreate({
                    userId,
                    batchId: 'batch-1',
                    sales: [giftedSaleInput()],
                });

                expect(tx.gifts.create).toHaveBeenCalledWith({
                    data: {
                        saleId: 'sale-1',
                        saleStatus: SaleStatus.GIFTED,
                        recipientId: 'recipient-1',
                        giftedAt: new Date('2026-03-01T12:00:00.000Z'),
                    },
                });
            });
        });

        describe('when a committed row is SOLD', () => {
            it('creates no gift row', async () => {
                const tx = mockTransaction();

                (tx.sales.create as Mock).mockResolvedValue({ id: 'sale-1' });

                await service.bulkCreate({
                    userId,
                    batchId: 'batch-1',
                    sales: [soldSaleInput()],
                });

                expect(tx.gifts.create).not.toHaveBeenCalled();
            });

            it('never resolves a recipient', async () => {
                const tx = mockTransaction();

                (tx.sales.create as Mock).mockResolvedValue({ id: 'sale-1' });

                await service.bulkCreate({
                    userId,
                    batchId: 'batch-1',
                    sales: [soldSaleInput()],
                });

                expect(recipientsDbService.findOrCreateForUser).not.toHaveBeenCalled();
            });
        });

        describe('when there are no sales to import', () => {
            it('returns 0 without opening a transaction', async () => {
                const result = await service.bulkCreate({
                    userId,
                    batchId: 'batch-1',
                    sales: [],
                });

                expect(result).toBe(0);
                expect(prismaService.$transaction).not.toHaveBeenCalled();
            });

            it('does not invalidate the sales cache', async () => {
                await service.bulkCreate({
                    userId,
                    batchId: 'batch-1',
                    sales: [],
                });

                expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            });
        });

        describe('when sales are created', () => {
            it("invalidates the user's sales list cache", async () => {
                const tx = mockTransaction();

                (tx.sales.create as Mock).mockResolvedValue({ id: 'sale-1' });

                await service.bulkCreate({
                    userId,
                    batchId: 'batch-1',
                    sales: [soldSaleInput()],
                });

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateSales(userId),
                );
            });
        });
    });

    describe('deleteBatch', () => {
        describe('when the batch has rows', () => {
            beforeEach(() => {
                prismaService.sales.findMany.mockResolvedValueOnce([
                    { id: 'sale-1' },
                    { id: 'sale-2' },
                ] as never);
            });

            it('deletes the gift rows for the batch alongside the sales', async () => {
                await service.deleteBatch(userId, 'batch-1');

                expect(prismaService.gifts.deleteMany).toHaveBeenCalledWith({
                    where: { saleId: { in: ['sale-1', 'sale-2'] } },
                });
            });

            it("invalidates each deleted sale and the user's sales list cache", async () => {
                await service.deleteBatch(userId, 'batch-1');

                expect(redisService.invalidate).toHaveBeenCalledWith(
                    CACHE_KEYS.sale('sale-1'),
                );
                expect(redisService.invalidate).toHaveBeenCalledWith(
                    CACHE_KEYS.sale('sale-2'),
                );
                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateSales(userId),
                );
            });
        });

        describe('when the batch has no rows', () => {
            it('returns 0 without deleting anything', async () => {
                prismaService.sales.findMany.mockResolvedValueOnce([]);

                const result = await service.deleteBatch(userId, 'batch-1');

                expect(result).toBe(0);
                expect(prismaService.gifts.deleteMany).not.toHaveBeenCalled();
            });

            it('does not invalidate any cache', async () => {
                prismaService.sales.findMany.mockResolvedValueOnce([]);

                await service.deleteBatch(userId, 'batch-1');

                expect(redisService.invalidate).not.toHaveBeenCalled();
                expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            });
        });
    });
});
