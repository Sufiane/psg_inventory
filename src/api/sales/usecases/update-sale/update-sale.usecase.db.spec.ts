import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { Prisma, SaleStatus } from '@prisma/client';

import type { RecipientId, SaleId, UserId } from '@psg/shared/ids';
import { UpdateSaleUsecaseDb } from './update-sale.usecase.db';
import { PrismaService } from '../../../../db/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { SalesDb } from '../../../../db/sales/sales.db';
import { IRecipientsDbService } from '../../../../db/recipients/recipients.db.interface';
import { RecipientsDb } from '../../../../db/recipients/recipients.db';
import { saleFixture } from '../../test-support/sales.fixtures';

describe('UpdateSaleUsecaseDb', () => {
    const userId = 'user-1' as UserId;
    const saleId = 'sale-1' as SaleId;

    let usecaseDb: UpdateSaleUsecaseDb;
    let prisma: DeepMockProxy<PrismaService>;
    let redisService: DeepMockProxy<RedisService>;
    let salesDbService: DeepMockProxy<SalesDb>;
    let recipientsDbService: DeepMockProxy<RecipientsDb>;

    function currentSaleRow(
        overrides: Partial<{
            status: SaleStatus;
        }> = {},
    ): unknown {
        return {
            id: saleId,
            userId,
            status: SaleStatus.PENDING,
            listedPrice: 100,
            profit: 90,
            ...overrides,
        };
    }

    function mockTransaction(): DeepMockProxy<Prisma.TransactionClient> {
        const tx = mockDeep<Prisma.TransactionClient>();

        (prisma.$transaction as Mock).mockImplementation(
            (callback: (tx: Prisma.TransactionClient) => unknown) => callback(tx),
        );

        return tx;
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UpdateSaleUsecaseDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
                { provide: ISalesDbService, useValue: mockDeep<SalesDb>() },
                { provide: IRecipientsDbService, useValue: mockDeep<RecipientsDb>() },
            ],
        }).compile();

        usecaseDb = module.get(UpdateSaleUsecaseDb);
        prisma = module.get(PrismaService);
        redisService = module.get(RedisService);
        salesDbService = module.get(ISalesDbService);
        recipientsDbService = module.get(IRecipientsDbService);

        module.useLogger(false);
    });

    describe('getOneSale', () => {
        it('delegates to ISalesDbService.getOneSale', async () => {
            const expected = saleFixture(new Date('2026-03-02T20:00:00.000Z'));
            salesDbService.getOneSale.mockResolvedValueOnce(expected);

            const result = await usecaseDb.getOneSale(userId, saleId);

            expect(result).toBe(expected);
            expect(salesDbService.getOneSale).toHaveBeenCalledWith(userId, saleId);
        });
    });

    describe('updateSale', () => {
        beforeEach(() => {
            prisma.sales.findUnique.mockResolvedValue(currentSaleRow() as never);
        });

        it('writes the narrowed status and no gift row', async () => {
            const tx = mockTransaction();

            await usecaseDb.updateSale({
                saleId,
                userId,
                profit: undefined,
                status: 'SOLD',
            });

            expect(tx.sales.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: SaleStatus.SOLD }),
                }),
            );
            expect(tx.gifts.create).not.toHaveBeenCalled();
        });

        it('invalidates the sales-list and single-sale caches', async () => {
            mockTransaction();

            await usecaseDb.updateSale({
                saleId,
                userId,
                profit: undefined,
                status: 'SOLD',
            });

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateSales(userId),
            );
            expect(redisService.invalidate).toHaveBeenCalledWith(CACHE_KEYS.sale(saleId));
        });

        describe('when the sale does not belong to the user', () => {
            it('throws SALE_NOT_FOUND', async () => {
                prisma.sales.findUnique.mockResolvedValueOnce(null);

                await expect(
                    usecaseDb.updateSale({
                        saleId,
                        userId,
                        profit: undefined,
                        status: 'SOLD',
                    }),
                ).rejects.toThrow();
            });
        });
    });

    describe('giftSale', () => {
        beforeEach(() => {
            prisma.sales.findUnique.mockResolvedValue(currentSaleRow() as never);
        });

        describe('when a new recipient name is given', () => {
            it('flips the status and writes the gift row on the same tx', async () => {
                const tx = mockTransaction();

                recipientsDbService.findOrCreateForUser.mockResolvedValueOnce({
                    id: 'r1' as RecipientId,
                    userId,
                    name: 'Marc',
                });

                await usecaseDb.giftSale({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientName: 'Marc' },
                });

                expect(tx.sales.update).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({ status: SaleStatus.GIFTED }),
                    }),
                );
                expect(recipientsDbService.findOrCreateForUser).toHaveBeenCalledWith(
                    userId,
                    'Marc',
                    tx,
                );
                expect(tx.gifts.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            saleId,
                            saleStatus: SaleStatus.GIFTED,
                            recipientId: 'r1',
                        }),
                    }),
                );
            });

            it('sets the status before inserting the gift row', async () => {
                const tx = mockTransaction();
                const order: string[] = [];

                recipientsDbService.findOrCreateForUser.mockResolvedValueOnce({
                    id: 'r1' as RecipientId,
                    userId,
                    name: 'Marc',
                });
                (tx.sales.update as Mock).mockImplementation(() => {
                    order.push('status');

                    return Promise.resolve({});
                });
                (tx.gifts.create as Mock).mockImplementation(() => {
                    order.push('gift');

                    return Promise.resolve({});
                });

                await usecaseDb.giftSale({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientName: 'Marc' },
                });

                expect(order).toEqual(['status', 'gift']);
            });
        });

        describe('when an explicit recipientId is given instead of a name', () => {
            it('does not call findOrCreateForUser', async () => {
                mockTransaction();

                await usecaseDb.giftSale({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientId: 'r5' as RecipientId },
                });

                expect(recipientsDbService.findOrCreateForUser).not.toHaveBeenCalled();
            });

            it('writes that id and returns it', async () => {
                const tx = mockTransaction();

                const result = await usecaseDb.giftSale({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientId: 'r5' as RecipientId },
                });

                expect(tx.gifts.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({ recipientId: 'r5' }),
                    }),
                );
                expect(result).toEqual({ recipientId: 'r5' });
            });
        });

        it('invalidates the sales-list and single-sale caches', async () => {
            mockTransaction();

            await usecaseDb.giftSale({
                saleId,
                userId,
                profit: undefined,
                recipient: { recipientId: 'r5' as RecipientId },
            });

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateSales(userId),
            );
            expect(redisService.invalidate).toHaveBeenCalledWith(CACHE_KEYS.sale(saleId));
        });
    });

    describe('updateGift', () => {
        beforeEach(() => {
            prisma.sales.findUnique.mockResolvedValue(
                currentSaleRow({ status: SaleStatus.GIFTED }) as never,
            );
        });

        describe('when a recipient is given', () => {
            it('updates the gift row and writes no status', async () => {
                const tx = mockTransaction();

                await usecaseDb.updateGift({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientId: 'r2' as RecipientId },
                });

                expect(tx.gifts.update).toHaveBeenCalledWith({
                    where: { saleId },
                    data: { recipientId: 'r2' },
                });
                expect(tx.sales.update).not.toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({ status: expect.anything() }),
                    }),
                );
            });
        });

        describe('when no recipient is given', () => {
            it('leaves the gift row untouched and returns the existing recipient', async () => {
                const tx = mockTransaction();

                (tx.gifts.findUniqueOrThrow as Mock).mockResolvedValueOnce({
                    recipientId: 'r1',
                });

                const result = await usecaseDb.updateGift({
                    saleId,
                    userId,
                    profit: undefined,
                    listedPrice: 150 as never,
                });

                expect(tx.gifts.update).not.toHaveBeenCalled();
                expect(result).toEqual({ recipientId: 'r1' });
            });
        });

        it('invalidates the sales-list and single-sale caches', async () => {
            const tx = mockTransaction();

            (tx.gifts.findUniqueOrThrow as Mock).mockResolvedValueOnce({
                recipientId: 'r1',
            });

            await usecaseDb.updateGift({
                saleId,
                userId,
                profit: undefined,
            });

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateSales(userId),
            );
            expect(redisService.invalidate).toHaveBeenCalledWith(CACHE_KEYS.sale(saleId));
        });
    });
});
