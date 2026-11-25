import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { Prisma, SaleStatus } from '@prisma/client';

import { CreateSaleUsecaseDb, CreateSaleWrite } from './create-sale.usecase.db';
import { PrismaService } from '../../../../db/prisma.service';
import { IMatchesDbService } from '../../../../db/matches/matches.db.interface';
import { IRecipientsDbService } from '../../../../db/recipients/recipients.db.interface';
import { matchFixture, matchId, passId, userId } from '../../test-support/sales.fixtures';
import type { TicketCount } from '@psg/shared/counts';
import type { RecipientId, SaleId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';

describe('CreateSaleUsecaseDb', () => {
    let usecaseDb: CreateSaleUsecaseDb;
    let prisma: DeepMockProxy<PrismaService>;
    let matchesDbService: DeepMockProxy<IMatchesDbService>;
    let recipientsDbService: DeepMockProxy<IRecipientsDbService>;

    const newSaleId = 'new-sale' as SaleId;
    const recipientId = 'recipient-uuid' as RecipientId;

    const basePayload: CreateSaleWrite = {
        userId,
        matchId,
        status: 'PENDING',
        listedPrice: 100 as ListedPrice,
        profit: 88 as Profit,
        invest: 10 as Invest,
        allocations: [
            { seasonPassId: passId, nbTickets: 2 as TicketCount },
            { seasonPassId: 'pass-2' as never, nbTickets: 1 as TicketCount },
        ],
    };

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                CreateSaleUsecaseDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: IMatchesDbService, useValue: mockDeep<IMatchesDbService>() },
                {
                    provide: IRecipientsDbService,
                    useValue: mockDeep<IRecipientsDbService>(),
                },
            ],
        }).compile();

        usecaseDb = module.get(CreateSaleUsecaseDb);
        prisma = module.get(PrismaService);
        matchesDbService = module.get(IMatchesDbService);
        recipientsDbService = module.get(IRecipientsDbService);

        module.useLogger(false);
    });

    function mockTransaction(): DeepMockProxy<Prisma.TransactionClient> {
        const tx = mockDeep<Prisma.TransactionClient>();

        (prisma.$transaction as Mock).mockImplementation(
            (callback: (tx: Prisma.TransactionClient) => unknown) => callback(tx),
        );
        tx.sales.create.mockResolvedValue({ id: newSaleId } as never);

        return tx;
    }

    describe('getMatchDate', () => {
        describe('when the match exists', () => {
            it('returns its date', async () => {
                const date = new Date('2026-09-01T18:00:00.000Z');
                matchesDbService.getOneMatch.mockResolvedValueOnce(matchFixture(date));

                const result = await usecaseDb.getMatchDate(matchId);

                expect(result).toEqual(date);
            });
        });

        describe('when the match is missing', () => {
            it('returns null', async () => {
                matchesDbService.getOneMatch.mockResolvedValueOnce(null);

                const result = await usecaseDb.getMatchDate(matchId);

                expect(result).toBeNull();
            });
        });
    });

    describe('createSale', () => {
        describe('when the status is PENDING', () => {
            let tx: DeepMockProxy<Prisma.TransactionClient>;

            beforeEach(() => {
                tx = mockTransaction();
            });

            it('creates the sale once with nested allocations and summed tickets', async () => {
                await usecaseDb.createSale(basePayload);

                expect(tx.sales.create).toHaveBeenCalledTimes(1);
                expect(tx.sales.create).toHaveBeenCalledWith({
                    data: {
                        userId,
                        matchId,
                        listedPrice: 100,
                        profit: 88,
                        invest: 10,
                        nbTickets: 3,
                        status: SaleStatus.PENDING,
                        Allocations: {
                            create: [
                                { seasonPassId: passId, nbTickets: 2 },
                                { seasonPassId: 'pass-2', nbTickets: 1 },
                            ],
                        },
                    },
                    select: { id: true },
                });
            });

            it('leaves soldAt unset', async () => {
                await usecaseDb.createSale(basePayload);

                const call = tx.sales.create.mock.calls[0]?.[0];

                expect(call?.data).not.toHaveProperty('soldAt');
            });

            it('writes no gift', async () => {
                await usecaseDb.createSale(basePayload);

                expect(tx.gifts.create).not.toHaveBeenCalled();
            });

            it('returns the id with no recipient', async () => {
                const result = await usecaseDb.createSale(basePayload);

                expect(result).toEqual({ id: newSaleId, recipientId: null });
            });
        });

        describe('when the status is SOLD', () => {
            it('sets soldAt', async () => {
                const tx = mockTransaction();

                await usecaseDb.createSale({ ...basePayload, status: 'SOLD' });

                const call = tx.sales.create.mock.calls[0]?.[0];

                expect(call?.data).toMatchObject({
                    status: SaleStatus.SOLD,
                    soldAt: expect.any(Date),
                });
            });
        });

        describe('when the amounts are zero', () => {
            it('writes them as given', async () => {
                const tx = mockTransaction();

                await usecaseDb.createSale({
                    ...basePayload,
                    listedPrice: 0 as ListedPrice,
                    profit: 0 as Profit,
                    invest: 0 as Invest,
                });

                const call = tx.sales.create.mock.calls[0]?.[0];

                expect(call?.data).toMatchObject({
                    listedPrice: 0,
                    profit: 0,
                    invest: 0,
                });
            });
        });

        describe('when the status is GIFTED', () => {
            let tx: DeepMockProxy<Prisma.TransactionClient>;
            const callOrder: string[] = [];

            beforeEach(() => {
                callOrder.length = 0;
                tx = mockTransaction();
                tx.sales.create.mockImplementation((() => {
                    callOrder.push('sales.create');

                    return Promise.resolve({ id: newSaleId });
                }) as never);
                tx.gifts.create.mockImplementation((() => {
                    callOrder.push('gifts.create');

                    return Promise.resolve({});
                }) as never);
                recipientsDbService.findOrCreateForUser.mockResolvedValue({
                    id: recipientId,
                } as never);
            });

            describe('and a recipient name is given', () => {
                const giftPayload: CreateSaleWrite = {
                    ...basePayload,
                    status: 'GIFTED',
                    recipient: { recipientName: 'Marc' },
                };

                it('creates the gift after the sale', async () => {
                    await usecaseDb.createSale(giftPayload);

                    expect(callOrder).toEqual(['sales.create', 'gifts.create']);
                    expect(tx.gifts.create).toHaveBeenCalledWith({
                        data: {
                            saleId: newSaleId,
                            saleStatus: SaleStatus.GIFTED,
                            recipientId,
                            giftedAt: expect.any(Date),
                        },
                    });
                });

                it('resolves the recipient on the same transaction', async () => {
                    await usecaseDb.createSale(giftPayload);

                    expect(recipientsDbService.findOrCreateForUser).toHaveBeenCalledWith(
                        userId,
                        'Marc',
                        tx,
                    );
                });

                it('returns the recipient id', async () => {
                    const result = await usecaseDb.createSale(giftPayload);

                    expect(result).toEqual({ id: newSaleId, recipientId });
                });

                it('does not set soldAt', async () => {
                    await usecaseDb.createSale(giftPayload);

                    const call = tx.sales.create.mock.calls[0]?.[0];

                    expect(call?.data).not.toHaveProperty('soldAt');
                });
            });

            describe('and an existing recipient id is given', () => {
                it('skips find-or-create', async () => {
                    await usecaseDb.createSale({
                        ...basePayload,
                        status: 'GIFTED',
                        recipient: { recipientId },
                    });

                    expect(
                        recipientsDbService.findOrCreateForUser,
                    ).not.toHaveBeenCalled();
                    expect(tx.gifts.create).toHaveBeenCalledWith({
                        data: expect.objectContaining({ recipientId }),
                    });
                });
            });

            describe('when the gift write fails', () => {
                beforeEach(() => {
                    tx.gifts.create.mockRejectedValueOnce(new Error('fk violation'));
                });

                it('rejects', async () => {
                    await expect(
                        usecaseDb.createSale({
                            ...basePayload,
                            status: 'GIFTED',
                            recipient: { recipientName: 'Marc' },
                        }),
                    ).rejects.toThrow('fk violation');
                });
            });
        });
    });
});
