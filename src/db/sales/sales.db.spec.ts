import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { Prisma, SaleStatus } from '@prisma/client';

import type { RecipientId, SaleId, UserId } from '@psg/shared/ids';
import { SalesDb } from './sales.db';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../redis/redis.service';
import { IRecipientsDbService } from '../recipients/recipients.db.interface';
import { RecipientsDb } from '../recipients/recipients.db';

describe('SalesDb', () => {
    const userId = 'user-1' as UserId;
    const saleId = 'sale-1' as SaleId;

    let service: SalesDb;
    let prismaService: DeepMockProxy<PrismaService>;
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

        (prismaService.$transaction as Mock).mockImplementation(
            (callback: (tx: Prisma.TransactionClient) => unknown) => callback(tx),
        );

        return tx;
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                SalesDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
                {
                    provide: IRecipientsDbService,
                    useValue: mockDeep<RecipientsDb>(),
                },
            ],
        }).compile();

        service = module.get(SalesDb);
        prismaService = module.get(PrismaService);
        recipientsDbService = module.get(IRecipientsDbService);

        module.useLogger(false);
    });

    describe('updateSale', () => {
        beforeEach(() => {
            prismaService.sales.findUnique.mockResolvedValue(currentSaleRow() as never);
        });

        it('writes the narrowed status and no gift row', async () => {
            const tx = mockTransaction();

            await service.updateSale({
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

        describe('when the sale does not belong to the user', () => {
            it('throws SALE_NOT_FOUND', async () => {
                prismaService.sales.findUnique.mockResolvedValueOnce(null);

                await expect(
                    service.updateSale({
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
            prismaService.sales.findUnique.mockResolvedValue(currentSaleRow() as never);
        });

        describe('when a new recipient name is given', () => {
            it('flips the status and writes the gift row on the same tx', async () => {
                const tx = mockTransaction();

                recipientsDbService.findOrCreateForUser.mockResolvedValueOnce({
                    id: 'r1' as RecipientId,
                    userId,
                    name: 'Marc',
                });

                await service.giftSale({
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

                await service.giftSale({
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

                await service.giftSale({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientId: 'r5' as RecipientId },
                });

                expect(recipientsDbService.findOrCreateForUser).not.toHaveBeenCalled();
            });

            it('writes that id and returns it', async () => {
                const tx = mockTransaction();

                const result = await service.giftSale({
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
    });

    describe('updateGift', () => {
        beforeEach(() => {
            prismaService.sales.findUnique.mockResolvedValue(
                currentSaleRow({ status: SaleStatus.GIFTED }) as never,
            );
        });

        describe('when a recipient is given', () => {
            it('updates the gift row and writes no status', async () => {
                const tx = mockTransaction();

                await service.updateGift({
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

                const result = await service.updateGift({
                    saleId,
                    userId,
                    profit: undefined,
                    listedPrice: 150 as never,
                });

                expect(tx.gifts.update).not.toHaveBeenCalled();
                expect(result).toEqual({ recipientId: 'r1' });
            });
        });
    });

    describe('ungiftSale', () => {
        beforeEach(() => {
            prismaService.sales.findUnique.mockResolvedValue(
                currentSaleRow({ status: SaleStatus.GIFTED }) as never,
            );
        });

        it('deletes the gift row before flipping the status back to PENDING', async () => {
            const tx = mockTransaction();
            const order: string[] = [];

            (tx.gifts.deleteMany as Mock).mockImplementation(() => {
                order.push('delete');

                return Promise.resolve({ count: 1 });
            });
            (tx.sales.update as Mock).mockImplementation(() => {
                order.push('status');

                return Promise.resolve({});
            });

            await service.ungiftSale(userId, saleId);

            expect(order).toEqual(['delete', 'status']);
            expect(tx.sales.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: SaleStatus.PENDING }),
                }),
            );
        });
    });

    describe('deleteSale', () => {
        it('removes the sale gift row inside the same transaction', async () => {
            const tx = mockTransaction();

            await service.deleteSale(userId, saleId);

            expect(tx.gifts.deleteMany).toHaveBeenCalledWith({ where: { saleId } });
        });
    });
});
