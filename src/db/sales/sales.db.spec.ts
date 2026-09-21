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
import type { Sale } from './type/sale.type';

describe('SalesDb', () => {
    const userId = 'user-1' as UserId;
    const saleId = 'sale-1' as SaleId;

    let service: SalesDb;
    let prismaService: DeepMockProxy<PrismaService>;
    let redisService: DeepMockProxy<RedisService>;
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
                {
                    provide: IRecipientsDbService,
                    useValue: mockDeep<RecipientsDb>(),
                },
            ],
        }).compile();

        service = module.get(SalesDb);
        prismaService = module.get(PrismaService);
        redisService = module.get(RedisService);
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

    });

    describe('getSalesGrouped', () => {
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

            // Data in match-date-ascending order (as getSales returns from the DB)
            const allSales = [
                cancelledSale,
                giftedSale,
                soldSale,
                pendingSale2,
                pendingSale1,
            ];

            (prismaService.sales.findMany as Mock).mockResolvedValue(allSales as never);

            const result = await service.getSalesGrouped(userId);

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

            const result = await service.getSalesGrouped(userId);

            expect(result.pending).toHaveLength(0);
            expect(result.terminal).toHaveLength(0);
        });
    });
});
});
