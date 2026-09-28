import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { Prisma, SaleStatus } from '@prisma/client';

import type { RecipientId, SaleId, UserId } from '@psg/shared/ids';
import { UpdateSaleUsecaseDb } from './update-sale.usecase.db';
import type { SaleRowSnapshot } from './update-sale.usecase.db';
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
    let warnSpy: Mock<typeof Logger.prototype.warn>;

    function currentSaleRow(
        overrides: Partial<{ status: SaleStatus }> = {},
    ): SaleRowSnapshot {
        return {
            id: saleId,
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

    function p2025RecordGone(): Prisma.PrismaClientKnownRequestError {
        return new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
            code: 'P2025',
            clientVersion: '6.0.1',
        });
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

        warnSpy = vi.spyOn(Logger.prototype, 'warn').mockClear();
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
        it('writes the narrowed status and no gift row', async () => {
            const tx = mockTransaction();

            const result = await usecaseDb.updateSale({
                saleId,
                userId,
                profit: undefined,
                status: 'SOLD',
                currentSale: currentSaleRow(),
            });

            expect(tx.sales.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: SaleStatus.SOLD }),
                }),
            );
            expect(tx.gifts.create).not.toHaveBeenCalled();
            expect(result).toBe('written');
        });

        it('invalidates the sales-list and single-sale caches', async () => {
            mockTransaction();

            await usecaseDb.updateSale({
                saleId,
                userId,
                profit: undefined,
                status: 'SOLD',
                currentSale: currentSaleRow(),
            });

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateSales(userId),
            );
            expect(redisService.invalidate).toHaveBeenCalledWith(CACHE_KEYS.sale(saleId));
        });

        it('does not re-read the sale row — the usecase already loaded it', async () => {
            mockTransaction();

            await usecaseDb.updateSale({
                saleId,
                userId,
                profit: undefined,
                status: 'SOLD',
                currentSale: currentSaleRow(),
            });

            expect(prisma.sales.findUnique).not.toHaveBeenCalled();
        });
    });

    describe('giftSale', () => {
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
                    currentSale: currentSaleRow(),
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
                    currentSale: currentSaleRow(),
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
                    currentSale: currentSaleRow(),
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
                    currentSale: currentSaleRow(),
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
                currentSale: currentSaleRow(),
            });

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateSales(userId),
            );
            expect(redisService.invalidate).toHaveBeenCalledWith(CACHE_KEYS.sale(saleId));
        });
    });

    describe('updateGift', () => {
        describe('when a recipient is given', () => {
            it('updates the gift row and writes no status', async () => {
                const tx = mockTransaction();

                await usecaseDb.updateGift({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientId: 'r2' as RecipientId },
                    currentSale: currentSaleRow({ status: SaleStatus.GIFTED }),
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
                    currentSale: currentSaleRow({ status: SaleStatus.GIFTED }),
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
                currentSale: currentSaleRow({ status: SaleStatus.GIFTED }),
            });

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateSales(userId),
            );
            expect(redisService.invalidate).toHaveBeenCalledWith(CACHE_KEYS.sale(saleId));
        });
    });

    describe('when the sale row is deleted between the load and the write', () => {
        it('updateSale reports not_found, skips cache invalidation and re-reads nothing', async () => {
            const tx = mockTransaction();
            tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

            const result = await usecaseDb.updateSale({
                saleId,
                userId,
                profit: undefined,
                status: 'SOLD',
                currentSale: currentSaleRow(),
            });

            expect(result).toBe('not_found');
            expect(prisma.sales.findUnique).not.toHaveBeenCalled();
            expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            expect(redisService.invalidate).not.toHaveBeenCalled();
        });

        it('giftSale reports null, skips cache invalidation and re-reads nothing', async () => {
            const tx = mockTransaction();
            tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

            const result = await usecaseDb.giftSale({
                saleId,
                userId,
                profit: undefined,
                recipient: { recipientId: 'r5' as RecipientId },
                currentSale: currentSaleRow(),
            });

            expect(result).toBeNull();
            expect(prisma.sales.findUnique).not.toHaveBeenCalled();
            expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            expect(redisService.invalidate).not.toHaveBeenCalled();
        });

        it('updateGift reports null, skips cache invalidation and re-reads nothing', async () => {
            const tx = mockTransaction();
            tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

            const result = await usecaseDb.updateGift({
                saleId,
                userId,
                profit: undefined,
                recipient: { recipientId: 'r2' as RecipientId },
                currentSale: currentSaleRow({ status: SaleStatus.GIFTED }),
            });

            expect(result).toBeNull();
            expect(prisma.sales.findUnique).not.toHaveBeenCalled();
            expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            expect(redisService.invalidate).not.toHaveBeenCalled();
        });

        it('updateSale logs the caught P2025 before returning not_found', async () => {
            const tx = mockTransaction();
            tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

            const result = await usecaseDb.updateSale({
                saleId,
                userId,
                profit: undefined,
                status: 'SOLD',
                currentSale: currentSaleRow(),
            });

            expect(result).toBe('not_found');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('P2025'),
                expect.objectContaining({
                    code: 'P2025',
                    message: expect.any(String),
                }),
            );
        });

        it('giftSale logs the caught P2025 before returning null', async () => {
            const tx = mockTransaction();
            tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

            const result = await usecaseDb.giftSale({
                saleId,
                userId,
                profit: undefined,
                recipient: { recipientId: 'r5' as RecipientId },
                currentSale: currentSaleRow(),
            });

            expect(result).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('P2025'),
                expect.objectContaining({
                    code: 'P2025',
                    message: expect.any(String),
                }),
            );
        });

        it('updateGift logs the caught P2025 before returning null', async () => {
            const tx = mockTransaction();
            tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

            const result = await usecaseDb.updateGift({
                saleId,
                userId,
                profit: undefined,
                recipient: { recipientId: 'r2' as RecipientId },
                currentSale: currentSaleRow({ status: SaleStatus.GIFTED }),
            });

            expect(result).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('P2025'),
                expect.objectContaining({
                    code: 'P2025',
                    message: expect.any(String),
                }),
            );
        });
    });

    describe('when the transaction rejects with an unexpected error', () => {
        it('updateSale rethrows it unchanged and does not invalidate the caches', async () => {
            const tx = mockTransaction();
            const failure = new Error('connection lost');
            tx.sales.update.mockRejectedValueOnce(failure);

            await expect(
                usecaseDb.updateSale({
                    saleId,
                    userId,
                    profit: undefined,
                    status: 'SOLD',
                    currentSale: currentSaleRow(),
                }),
            ).rejects.toBe(failure);

            expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            expect(redisService.invalidate).not.toHaveBeenCalled();
        });

        it('giftSale rethrows it unchanged and does not invalidate the caches', async () => {
            const tx = mockTransaction();
            const failure = new Error('connection lost');
            tx.sales.update.mockRejectedValueOnce(failure);

            await expect(
                usecaseDb.giftSale({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientId: 'r5' as RecipientId },
                    currentSale: currentSaleRow(),
                }),
            ).rejects.toBe(failure);

            expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            expect(redisService.invalidate).not.toHaveBeenCalled();
        });

        it('updateGift rethrows it unchanged and does not invalidate the caches', async () => {
            const tx = mockTransaction();
            const failure = new Error('connection lost');
            tx.sales.update.mockRejectedValueOnce(failure);

            await expect(
                usecaseDb.updateGift({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientId: 'r2' as RecipientId },
                    currentSale: currentSaleRow({ status: SaleStatus.GIFTED }),
                }),
            ).rejects.toBe(failure);

            expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            expect(redisService.invalidate).not.toHaveBeenCalled();
        });
    });
});
