import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { SalesService } from './sales.service';
import { SalesDb } from '../../db/sales/sales.db';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { MatchesDb } from '../../db/matches/matches.db';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { SeasonPassesDb } from '../../db/season-passes/season-passes.db';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import { RecipientsDb } from '../../db/recipients/recipients.db';
import { IRecipientsDbService } from '../../db/recipients/recipients.db.interface';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { Sale } from '../../db/sales/type/sale.type';
import { SeasonPass } from '../../db/season-passes/type/season-pass.type';
import { Match } from '../../db/matches/types/match.type';
import { AddSaleDto } from './dto/add-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { IUngiftSaleUsecase } from './usecases/ungift-sale/ungift-sale.usecase';
import { IDeleteSaleUsecase } from './usecases/delete-sale/delete-sale.usecase';
import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, RecipientId, SaleId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice } from '@psg/shared/money';

describe('SalesService', () => {
    let service: SalesService;
    let salesDbService: DeepMockProxy<SalesDb>;
    let matchesDbService: DeepMockProxy<MatchesDb>;
    let seasonPassesDbService: DeepMockProxy<SeasonPassesDb>;
    let recipientsDbService: DeepMockProxy<RecipientsDb>;
    let redisService: DeepMockProxy<RedisService>;
    let ungiftSaleUsecase: DeepMockProxy<IUngiftSaleUsecase>;
    let deleteSaleUsecase: DeepMockProxy<IDeleteSaleUsecase>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;
    const matchId = 'match-uuid' as MatchId;
    const passId = 'pass-uuid' as SeasonPassId;

    function saleFixture(
        matchDate: Date,
        status: SaleStatus = SaleStatus.PENDING,
        gift: Sale['Gift'] = null,
    ): Sale {
        return {
            id: saleId,
            userId,
            matchId,
            listedPrice: 100,
            profit: 90,
            invest: 50,
            nbTickets: 1,
            status,
            createdAt: new Date(),
            updatedAt: new Date(),
            soldAt: null,
            cancelledAt: null,
            Gift: gift,
            Match: {
                date: matchDate,
                Opponent: { id: 'opp', name: 'Marseille' },
            },
            Allocations: [],
        } as unknown as Sale;
    }

    function giftFixture(
        overrides: Partial<{
            giftedAt: Date;
            recipientId: RecipientId;
            Recipient: { id: RecipientId; name: string };
        }> = {},
    ): NonNullable<Sale['Gift']> {
        return {
            giftedAt: new Date('2026-03-01T12:00:00.000Z'),
            recipientId: 'r9' as RecipientId,
            Recipient: { id: 'r9' as RecipientId, name: 'Marc' },
            ...overrides,
        } as NonNullable<Sale['Gift']>;
    }

    function matchFixture(date: Date): Match {
        return {
            id: matchId,
            date,
            atHome: true,
            competition: 'CHAMPIONSHIP',
        } as unknown as Match;
    }

    function passFixture(overrides: Partial<SeasonPass> = {}): SeasonPass {
        return {
            id: passId,
            userId,
            seasonStartYear: 2024,
            price: 1000,
            label: 'Pass',
            category: 'cat',
            row: 'row',
            seat: 'seat',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides,
        };
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                SalesService,
                { provide: ISalesDbService, useValue: mockDeep<SalesDb>() },
                { provide: IMatchesDbService, useValue: mockDeep<MatchesDb>() },
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<SeasonPassesDb>(),
                },
                {
                    provide: IRecipientsDbService,
                    useValue: mockDeep<RecipientsDb>(),
                },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
                { provide: IUngiftSaleUsecase, useValue: mockDeep<IUngiftSaleUsecase>() },
                { provide: IDeleteSaleUsecase, useValue: mockDeep<IDeleteSaleUsecase>() },
            ],
        }).compile();

        service = module.get(SalesService);
        salesDbService = module.get(ISalesDbService);
        // Harmless defaults so tests that route through giftSale / updateGift
        // but don't care about the resolved recipient don't have to configure
        // it themselves. Tests that do care override with mockResolvedValueOnce.
        salesDbService.giftSale.mockResolvedValue({
            recipientId: 'r-default' as RecipientId,
        });
        salesDbService.updateGift.mockResolvedValue({
            recipientId: 'r-default' as RecipientId,
        });
        matchesDbService = module.get(IMatchesDbService);
        seasonPassesDbService = module.get(ISeasonPassesDbService);
        recipientsDbService = module.get(IRecipientsDbService);
        redisService = module.get(RedisService);
        ungiftSaleUsecase = module.get(IUngiftSaleUsecase);
        deleteSaleUsecase = module.get(IDeleteSaleUsecase);

        module.useLogger(false);
    });

    describe('getCurrentSeasonSales', () => {
        it('queries with the same exclusive-upper season bounds getSalesByRange expects', async () => {
            vi.useFakeTimers().setSystemTime(new Date('2026-07-29T00:00:00.000Z'));

            salesDbService.getSalesByRange.mockResolvedValueOnce([]);

            await service.getCurrentSeasonSales(userId);

            expect(salesDbService.getSalesByRange).toHaveBeenCalledWith(userId, {
                from: new Date('2025-08-01T00:00:00.000Z'),
                to: new Date('2026-08-01T00:00:00.000Z'),
            });

            vi.useRealTimers();
        });
    });

    describe('reading a sale', () => {
        describe('when the sale has a gift', () => {
            it('serves the gift nested on the sale', async () => {
                const giftedAt = new Date('2026-03-01T12:00:00.000Z');

                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(
                        new Date('2026-03-02T20:00:00.000Z'),
                        SaleStatus.GIFTED,
                        giftFixture({
                            giftedAt,
                            recipientId: 'r1' as RecipientId,
                            Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                        }),
                    ),
                );

                const result = await service.getSale(userId, saleId);

                expect(result.Gift).toEqual({
                    giftedAt,
                    recipientId: 'r1',
                    Recipient: { id: 'r1', name: 'Marc' },
                });
            });
        });

        describe('when the sale has no gift', () => {
            it('serves a null gift', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(new Date('2026-03-02T20:00:00.000Z')),
                );

                const result = await service.getSale(userId, saleId);

                expect(result.Gift).toBeNull();
            });
        });

        describe('when listing sales', () => {
            it('keeps the gift nested on every row', async () => {
                salesDbService.getSales.mockResolvedValueOnce([
                    saleFixture(
                        new Date('2026-03-02T20:00:00.000Z'),
                        SaleStatus.GIFTED,
                        giftFixture({
                            giftedAt: new Date('2026-03-01T12:00:00.000Z'),
                            recipientId: 'r1' as RecipientId,
                            Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                        }),
                    ),
                ]);

                const [sale] = await service.getSales(userId);

                expect(sale?.Gift).toEqual({
                    giftedAt: new Date('2026-03-01T12:00:00.000Z'),
                    recipientId: 'r1',
                    Recipient: { id: 'r1', name: 'Marc' },
                });
            });
        });
    });

    describe('updateSale kickoff guard', () => {
        describe('when the match kickoff has passed', () => {
            it('rejects marking the sale SOLD', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000)),
                );

                const payload: UpdateSaleDto = {
                    saleId,
                    status: 'SOLD',
                } as UpdateSaleDto;

                await expect(service.updateSale(userId, payload)).rejects.toThrow(
                    DomainException,
                );
                await expect(service.updateSale(userId, payload)).rejects.toMatchObject({
                    code: ErrorCode.SALE_AFTER_KICKOFF,
                });

                expect(salesDbService.updateSale).not.toHaveBeenCalled();
            });
        });

        describe('when the match is in the future', () => {
            it('allows marking the sale SOLD', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60 * 60_000)),
                );

                const payload: UpdateSaleDto = {
                    saleId,
                    status: 'SOLD',
                    listedPrice: 120 as ListedPrice,
                } as UpdateSaleDto;

                await expect(
                    service.updateSale(userId, payload),
                ).resolves.toBeUndefined();
                expect(salesDbService.updateSale).toHaveBeenCalledTimes(1);
                expect(redisService.invalidatePattern).toHaveBeenCalled();
            });
        });

        describe('when the target sale does not exist', () => {
            it('throws SALE_NOT_FOUND', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce(null);

                const payload: UpdateSaleDto = {
                    saleId,
                    status: 'SOLD',
                } as UpdateSaleDto;

                await expect(service.updateSale(userId, payload)).rejects.toMatchObject({
                    code: ErrorCode.SALE_NOT_FOUND,
                });
            });
        });
    });

    describe('updateSale status transitions', () => {
        describe('when the target is SOLD and the match has kicked off', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000)),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'SOLD',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({ code: ErrorCode.SALE_AFTER_KICKOFF });
            });
        });

        describe('when the target is GIFTED from PENDING and the match has kicked off', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.PENDING),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                        recipientName: 'Marc',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({ code: ErrorCode.SALE_AFTER_KICKOFF });
            });
        });

        describe('when the sale is already GIFTED and the match has kicked off', () => {
            // The recipient-update exemption (spec D5 / D9). Correcting who
            // received an already-gifted ticket is not a decision that has to
            // precede the match, so this stays allowed after kickoff. Do not
            // "simplify" the guard to key on the target alone — this is the
            // test that catches it.
            it('allows the recipient to be corrected', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() - 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'recipient-0' as RecipientId }),
                    ),
                );
                salesDbService.updateGift.mockResolvedValueOnce({
                    recipientId: 'r1' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(salesDbService.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'Marc' } }),
                );
            });

            it('allows an existing recipient to be replaced', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() - 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'recipient-1' as RecipientId }),
                    ),
                );
                salesDbService.updateGift.mockResolvedValueOnce({
                    recipientId: 'r2' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Sofia',
                } as UpdateSaleDto);

                expect(salesDbService.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'Sofia' } }),
                );
            });
        });

        describe('when no status is sent at all and the match has kicked off', () => {
            it('allows the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() - 60_000),
                        SaleStatus.GIFTED,
                        giftFixture(),
                    ),
                );

                await service.updateSale(userId, {
                    saleId,
                    listedPrice: 150,
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ listedPrice: 150 }),
                );

                expect(salesDbService.updateSale.mock.calls[0]?.[0]).not.toHaveProperty(
                    'status',
                );
            });
        });

        describe('when the sale is SOLD and the target is GIFTED', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.SOLD),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                        recipientName: 'Marc',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_INVALID_STATUS_TRANSITION,
                });
            });
        });

        describe('when the sale is SOLD, the target is GIFTED, and the match has kicked off', () => {
            it('rejects the update with the transition error, not the kickoff error', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.SOLD),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                        recipientName: 'Marc',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_INVALID_STATUS_TRANSITION,
                });
            });
        });

        describe('when the sale is CANCELLED and the target is GIFTED', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.CANCELLED),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                        recipientName: 'Marc',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_INVALID_STATUS_TRANSITION,
                });
            });
        });

        describe('when the sale is GIFTED and the target is PENDING', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture(),
                    ),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'PENDING',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_INVALID_STATUS_TRANSITION,
                });
            });
        });

        describe('when the sale is GIFTED and the target is SOLD', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture(),
                    ),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'SOLD',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_INVALID_STATUS_TRANSITION,
                });
            });
        });

        describe('when the sale is PENDING and the target is GIFTED before kickoff', () => {
            it('allows the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.PENDING),
                );
                salesDbService.giftSale.mockResolvedValueOnce({
                    recipientId: 'r1' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(salesDbService.giftSale).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'Marc' } }),
                );
            });
        });

        describe('when the sale is SOLD and the target is PENDING after kickoff', () => {
            it('allows the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.SOLD),
                );

                await service.updateSale(userId, {
                    saleId,
                    status: 'PENDING',
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'PENDING' }),
                );
            });
        });

        describe('when the sale is CANCELLED and the target is PENDING after kickoff', () => {
            it('allows the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.CANCELLED),
                );

                await service.updateSale(userId, {
                    saleId,
                    status: 'PENDING',
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'PENDING' }),
                );
            });
        });

        describe('when the target is GIFTED with no recipient', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED,
                });
            });

            it('does not write the sale', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                    } as UpdateSaleDto),
                ).rejects.toThrow(DomainException);

                expect(salesDbService.giftSale).not.toHaveBeenCalled();
            });
        });

        describe('when the sale is already GIFTED and the status is resubmitted unchanged with no recipient in the request', () => {
            beforeEach(() => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r9' as RecipientId }),
                    ),
                );
                salesDbService.updateGift.mockResolvedValue({
                    recipientId: 'r9' as RecipientId,
                });
            });

            it('does not throw', async () => {
                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                        listedPrice: 150 as ListedPrice,
                    } as UpdateSaleDto),
                ).resolves.toBeUndefined();
            });

            it('does not look up or create a recipient', async () => {
                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    listedPrice: 150 as ListedPrice,
                } as UpdateSaleDto);

                expect(recipientsDbService.findByNameForUser).not.toHaveBeenCalled();
                expect(recipientsDbService.create).not.toHaveBeenCalled();
            });

            it('updates the other fields without sending a recipient patch', async () => {
                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    listedPrice: 150 as ListedPrice,
                } as UpdateSaleDto);

                const callArg = salesDbService.updateGift.mock.calls[0]![0];

                expect(callArg).toMatchObject({ listedPrice: 150 });
                expect(callArg).not.toHaveProperty('recipient');
            });
        });

        describe('when the sale is already GIFTED and a new recipient is supplied', () => {
            it('resolves and updates the recipient', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r9' as RecipientId }),
                    ),
                );
                recipientsDbService.findByIdForUser.mockResolvedValueOnce({
                    id: 'r10' as RecipientId,
                    userId,
                    name: 'Ana',
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientId: 'r10' as RecipientId,
                } as UpdateSaleDto);

                expect(salesDbService.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientId: 'r10' } }),
                );
            });
        });

        describe('when recipientId is sent for an existing recipient owned by the user', () => {
            it('uses the id directly, without a name lookup', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );
                recipientsDbService.findByIdForUser.mockResolvedValueOnce({
                    id: 'r5' as RecipientId,
                    userId,
                    name: 'Marc',
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientId: 'r5' as RecipientId,
                } as UpdateSaleDto);

                expect(recipientsDbService.findByIdForUser).toHaveBeenCalledWith(
                    'r5',
                    userId,
                );
                expect(recipientsDbService.findByNameForUser).not.toHaveBeenCalled();
                expect(salesDbService.giftSale).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientId: 'r5' } }),
                );
            });
        });

        describe('when recipientId is sent for a recipient that does not belong to the user', () => {
            beforeEach(() => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );
                recipientsDbService.findByIdForUser.mockResolvedValueOnce(null);
            });

            it('rejects the update instead of writing another user’s recipient', async () => {
                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                        recipientId: 'someone-elses-recipient' as RecipientId,
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_GIFT_RECIPIENT_NOT_FOUND,
                });
            });

            it('does not write the sale', async () => {
                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                        recipientId: 'someone-elses-recipient' as RecipientId,
                    } as UpdateSaleDto),
                ).rejects.toThrow(DomainException);

                expect(salesDbService.giftSale).not.toHaveBeenCalled();
            });
        });

        // Resolve-or-create by name (existing vs. new) is a db-layer concern
        // now — it runs inside the sale-write transaction so a failed write
        // can't orphan a newly-created recipient (finding 6). See
        // src/db/sales/sales.db.spec.ts for that resolution behavior;
        // this layer's job is only to pass the normalized name through.
        describe('when a recipient name is given', () => {
            it('trims and collapses whitespace before sending it to the db layer', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: '  Chloé   Dupont  ',
                } as UpdateSaleDto);

                expect(salesDbService.giftSale).toHaveBeenCalledWith(
                    expect.objectContaining({
                        recipient: { recipientName: 'Chloé Dupont' },
                    }),
                );
            });

            it('does not resolve it itself', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(recipientsDbService.findByNameForUser).not.toHaveBeenCalled();
                expect(recipientsDbService.create).not.toHaveBeenCalled();
            });
        });

        // GIFTED -> PENDING used to be a legal exit and clear the recipient;
        // D5's revision made GIFTED terminal, so this is now covered by
        // "when the sale is GIFTED and the target is PENDING" above, which
        // asserts SALE_INVALID_STATUS_TRANSITION instead. The sanctioned exit
        // is scripts/ungift-sale.ts — see "ungiftSale" below.
    });

    describe('routing a write to the db layer', () => {
        // The mirror of the already-GIFTED no-status case: a recipient sent
        // for a sale that is neither gifted nor becoming gifted used to
        // return 200 having written nothing.
        describe('when a recipient is sent for a sale that is not and is not becoming GIFTED', () => {
            it('rejects instead of silently dropping the recipient', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(new Date(Date.now() + 86_400_000), SaleStatus.PENDING),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        recipientName: 'Marc',
                    } as UpdateSaleDto),
                ).rejects.toThrow(DomainException);

                expect(salesDbService.updateSale).not.toHaveBeenCalled();
                expect(salesDbService.giftSale).not.toHaveBeenCalled();
                expect(salesDbService.updateGift).not.toHaveBeenCalled();
            });
        });

        describe('when a PENDING sale is gifted before kickoff', () => {
            it('calls giftSale and never the generic update', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(new Date(Date.now() + 86_400_000)),
                );
                salesDbService.giftSale.mockResolvedValueOnce({
                    recipientId: 'r1' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(salesDbService.giftSale).toHaveBeenCalledWith(
                    expect.objectContaining({
                        saleId,
                        userId,
                        recipient: { recipientName: 'Marc' },
                    }),
                );
                expect(salesDbService.updateSale).not.toHaveBeenCalled();
            });
        });

        describe('when an already-GIFTED sale gets a new recipient after kickoff', () => {
            it('calls updateGift and sends no status', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(
                        new Date(Date.now() - 86_400_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r1' as RecipientId }),
                    ),
                );
                salesDbService.updateGift.mockResolvedValueOnce({
                    recipientId: 'r2' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Ana',
                } as UpdateSaleDto);

                expect(salesDbService.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'Ana' } }),
                );
                expect(salesDbService.giftSale).not.toHaveBeenCalled();
                expect(salesDbService.updateSale).not.toHaveBeenCalled();
            });

            it('invalidates the recipients cache when the recipient changed', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(
                        new Date(Date.now() - 86_400_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r1' as RecipientId }),
                    ),
                );
                salesDbService.updateGift.mockResolvedValueOnce({
                    recipientId: 'r2' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Ana',
                } as UpdateSaleDto);

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when an already-GIFTED sale gets a new recipient and no status field is sent at all', () => {
            it('routes to updateGift and updates the recipient, not the plain field patch', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(
                        new Date(Date.now() - 86_400_000),
                        SaleStatus.GIFTED,
                        giftFixture({
                            recipientId: 'r1' as RecipientId,
                            Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                        }),
                    ),
                );
                salesDbService.updateGift.mockResolvedValueOnce({
                    recipientId: 'r2' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    recipientName: 'NewName',
                } as UpdateSaleDto);

                expect(salesDbService.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'NewName' } }),
                );
                expect(salesDbService.giftSale).not.toHaveBeenCalled();
                expect(salesDbService.updateSale).not.toHaveBeenCalled();
                // Proves the recipient actually changed, not just that some
                // code path ran: the resolved id moved from r1 to r2, so the
                // giftCount-ordered recipients cache must be invalidated.
                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when a PENDING sale is marked SOLD', () => {
            it('calls the generic update with the narrowed status', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(new Date(Date.now() + 86_400_000)),
                );

                await service.updateSale(userId, {
                    saleId,
                    status: 'SOLD',
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'SOLD' }),
                );
                expect(salesDbService.giftSale).not.toHaveBeenCalled();
            });
        });
    });

    describe('ungiftSale', () => {
        it('delegates to UngiftSaleUsecase.execute', async () => {
            await service.ungiftSale(userId, saleId);

            expect(ungiftSaleUsecase.execute).toHaveBeenCalledWith(userId, saleId);
        });
    });

    describe('updateSale recipients cache invalidation', () => {
        describe('when the sale enters GIFTED', () => {
            it('invalidates the recipients cache', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );
                salesDbService.giftSale.mockResolvedValueOnce({
                    recipientId: 'r1' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when the sale stays GIFTED and is reassigned to a different recipient by name', () => {
            it('invalidates the recipients cache using the id the db layer resolved', async () => {
                // The recipient a `recipientName` patch settles on is only
                // known through the db layer's return value (it resolves
                // inside its own transaction — finding 6), so this proves
                // that return value actually drives the invalidation
                // decision, not just the GIFTED-entry short-circuit.
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r9' as RecipientId }),
                    ),
                );
                salesDbService.updateGift.mockResolvedValueOnce({
                    recipientId: 'r10' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Ana',
                } as UpdateSaleDto);

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when the recipient changes while the sale stays GIFTED', () => {
            it('invalidates the recipients cache', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r9' as RecipientId }),
                    ),
                );
                recipientsDbService.findByIdForUser.mockResolvedValueOnce({
                    id: 'r10' as RecipientId,
                    userId,
                    name: 'Ana',
                });
                salesDbService.updateGift.mockResolvedValueOnce({
                    recipientId: 'r10' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientId: 'r10' as RecipientId,
                } as UpdateSaleDto);

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when the sale stays GIFTED with no recipient change', () => {
            it('does not invalidate the recipients cache', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r9' as RecipientId }),
                    ),
                );
                salesDbService.updateGift.mockResolvedValueOnce({
                    recipientId: 'r9' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    listedPrice: 150 as ListedPrice,
                } as UpdateSaleDto);

                expect(redisService.invalidatePattern).not.toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when the update does not touch status at all', () => {
            it('does not invalidate the recipients cache', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await service.updateSale(userId, {
                    saleId,
                    listedPrice: 150 as ListedPrice,
                } as UpdateSaleDto);

                expect(redisService.invalidatePattern).not.toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });
    });

    describe('deleteSale', () => {
        it('delegates to DeleteSaleUsecase.execute', async () => {
            await service.deleteSale(userId, saleId);

            expect(deleteSaleUsecase.execute).toHaveBeenCalledWith(userId, saleId);
        });
    });

    describe('addSale allocations', () => {
        const validPayload: AddSaleDto = {
            matchId,
            allocations: [{ seasonPassId: passId, nbTickets: 2 as TicketCount }],
            listedPrice: 100 as ListedPrice,
            invest: 0 as Invest,
        };

        it('creates the sale when allocations match the user and season', async () => {
            matchesDbService.getOneMatch.mockResolvedValueOnce(
                matchFixture(new Date('2024-09-15')),
            );
            seasonPassesDbService.findById.mockResolvedValueOnce(passFixture());
            salesDbService.addSale.mockResolvedValueOnce({ id: 'new-sale' as SaleId });

            const result = await service.addSale(userId, validPayload);

            expect(result).toEqual({ id: 'new-sale' });
            expect(salesDbService.addSale).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId,
                    matchId,
                    allocations: validPayload.allocations,
                }),
            );
        });

        it('rejects when an allocation references a pass owned by another user', async () => {
            matchesDbService.getOneMatch.mockResolvedValueOnce(
                matchFixture(new Date('2024-09-15')),
            );
            seasonPassesDbService.findById.mockResolvedValueOnce(
                passFixture({ userId: 'someone-else' as UserId }),
            );

            await expect(service.addSale(userId, validPayload)).rejects.toMatchObject({
                code: ErrorCode.SALE_ALLOCATION_PASS_MISMATCH,
            });
        });

        it('rejects when the pass belongs to a different season than the match', async () => {
            matchesDbService.getOneMatch.mockResolvedValueOnce(
                matchFixture(new Date('2024-09-15')),
            );
            seasonPassesDbService.findById.mockResolvedValueOnce(
                passFixture({ seasonStartYear: 2023 }),
            );

            await expect(service.addSale(userId, validPayload)).rejects.toMatchObject({
                code: ErrorCode.SALE_ALLOCATION_PASS_MISMATCH,
            });
        });

        it('rejects duplicate allocations to the same pass', async () => {
            matchesDbService.getOneMatch.mockResolvedValueOnce(
                matchFixture(new Date('2024-09-15')),
            );

            await expect(
                service.addSale(userId, {
                    ...validPayload,
                    allocations: [
                        { seasonPassId: passId, nbTickets: 1 as TicketCount },
                        { seasonPassId: passId, nbTickets: 1 as TicketCount },
                    ],
                }),
            ).rejects.toMatchObject({
                code: ErrorCode.SALE_INVALID_ALLOCATIONS,
            });
        });
    });

    describe('updateSale allocations', () => {
        const futureMatchDate = new Date(Date.now() + 60 * 60_000);

        describe('when the pass belongs to a different season than the match', () => {
            const payload: UpdateSaleDto = {
                saleId,
                allocations: [{ seasonPassId: passId, nbTickets: 2 as TicketCount }],
            } as UpdateSaleDto;

            beforeEach(() => {
                salesDbService.getOneSale.mockResolvedValue(saleFixture(futureMatchDate));
                matchesDbService.getOneMatch.mockResolvedValue(
                    matchFixture(new Date('2024-09-15')),
                );
                seasonPassesDbService.findById.mockResolvedValue(
                    passFixture({ seasonStartYear: 2023 }),
                );
            });

            it('rejects the update with SALE_ALLOCATION_PASS_MISMATCH', async () => {
                await expect(service.updateSale(userId, payload)).rejects.toMatchObject({
                    code: ErrorCode.SALE_ALLOCATION_PASS_MISMATCH,
                });
            });

            it('does not write the sale', async () => {
                await expect(service.updateSale(userId, payload)).rejects.toThrow(
                    DomainException,
                );

                expect(salesDbService.updateSale).not.toHaveBeenCalled();
            });
        });

        describe('when the pass belongs to the same season as the match', () => {
            beforeEach(() => {
                salesDbService.getOneSale.mockResolvedValue(saleFixture(futureMatchDate));
                matchesDbService.getOneMatch.mockResolvedValue(
                    matchFixture(new Date('2024-09-15')),
                );
                seasonPassesDbService.findById.mockResolvedValue(passFixture());
            });

            it('writes the allocations through to the db layer', async () => {
                const allocations = [
                    { seasonPassId: passId, nbTickets: 2 as TicketCount },
                ];

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        allocations,
                    } as UpdateSaleDto),
                ).resolves.toBeUndefined();

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ saleId, userId, allocations }),
                );
            });
        });
    });
});
