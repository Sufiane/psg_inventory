import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { UpdateSaleUsecase, IUpdateSaleUsecase } from './update-sale.usecase';
import { IUpdateSaleUsecaseDb } from './update-sale.usecase.db';
import { IMatchesDbService } from '../../../../db/matches/matches.db.interface';
import { MatchesDb } from '../../../../db/matches/matches.db';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import { SeasonPassesDb } from '../../../../db/season-passes/season-passes.db';
import { IRecipientsDbService } from '../../../../db/recipients/recipients.db.interface';
import { RecipientsDb } from '../../../../db/recipients/recipients.db';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { UpdateSaleDto } from '../../dto/update-sale.dto';
import { SaleAllocationsValidator } from '../../shared/sale-allocations.validator';
import { SalesCacheInvalidator } from '../../shared/sales-cache.invalidator';
import {
    giftFixture,
    matchFixture,
    passFixture,
    passId,
    saleFixture,
    saleId,
    userId,
} from '../../test-support/sales.fixtures';
import type { TicketCount } from '@psg/shared/counts';
import type { RecipientId } from '@psg/shared/ids';
import type { ListedPrice } from '@psg/shared/money';

describe('UpdateSaleUsecase', () => {
    let usecase: IUpdateSaleUsecase;
    let db: DeepMockProxy<IUpdateSaleUsecaseDb>;
    let matchesDbService: DeepMockProxy<MatchesDb>;
    let seasonPassesDbService: DeepMockProxy<SeasonPassesDb>;
    let recipientsDbService: DeepMockProxy<RecipientsDb>;
    let redisService: DeepMockProxy<RedisService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UpdateSaleUsecase,
                {
                    provide: IUpdateSaleUsecaseDb,
                    useValue: mockDeep<IUpdateSaleUsecaseDb>(),
                },
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
                SaleAllocationsValidator,
                SalesCacheInvalidator,
            ],
        }).compile();

        usecase = module.get(UpdateSaleUsecase);
        db = module.get(IUpdateSaleUsecaseDb);
        // Harmless defaults so tests that route through giftSale / updateGift
        // but don't care about the resolved recipient don't have to configure
        // it themselves. Tests that do care override with mockResolvedValueOnce.
        db.giftSale.mockResolvedValue({
            recipientId: 'r-default' as RecipientId,
        });
        db.updateGift.mockResolvedValue({
            recipientId: 'r-default' as RecipientId,
        });
        matchesDbService = module.get(IMatchesDbService);
        seasonPassesDbService = module.get(ISeasonPassesDbService);
        recipientsDbService = module.get(IRecipientsDbService);
        redisService = module.get(RedisService);

        module.useLogger(false);
    });

    describe('updateSale kickoff guard', () => {
        describe('when the match kickoff has passed', () => {
            it('rejects marking the sale SOLD', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000)),
                );

                const payload: UpdateSaleDto = {
                    saleId,
                    status: 'SOLD',
                } as UpdateSaleDto;

                await expect(usecase.execute(userId, payload)).rejects.toThrow(
                    DomainException,
                );
                await expect(usecase.execute(userId, payload)).rejects.toMatchObject({
                    code: ErrorCode.SALE_AFTER_KICKOFF,
                });

                expect(db.updateSale).not.toHaveBeenCalled();
            });
        });

        describe('when the match is in the future', () => {
            it('allows marking the sale SOLD', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60 * 60_000)),
                );

                const payload: UpdateSaleDto = {
                    saleId,
                    status: 'SOLD',
                    listedPrice: 120 as ListedPrice,
                } as UpdateSaleDto;

                await expect(usecase.execute(userId, payload)).resolves.toBeUndefined();
                expect(db.updateSale).toHaveBeenCalledTimes(1);
                expect(redisService.invalidatePattern).toHaveBeenCalled();
            });
        });

        describe('when the target sale does not exist', () => {
            it('throws SALE_NOT_FOUND', async () => {
                db.getOneSale.mockResolvedValueOnce(null);

                const payload: UpdateSaleDto = {
                    saleId,
                    status: 'SOLD',
                } as UpdateSaleDto;

                await expect(usecase.execute(userId, payload)).rejects.toMatchObject({
                    code: ErrorCode.SALE_NOT_FOUND,
                });
            });
        });
    });

    describe('updateSale status transitions', () => {
        describe('when the target is SOLD and the match has kicked off', () => {
            it('rejects the update', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000)),
                );

                await expect(
                    usecase.execute(userId, {
                        saleId,
                        status: 'SOLD',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({ code: ErrorCode.SALE_AFTER_KICKOFF });
            });
        });

        describe('when the target is GIFTED from PENDING and the match has kicked off', () => {
            it('rejects the update', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.PENDING),
                );

                await expect(
                    usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() - 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'recipient-0' as RecipientId }),
                    ),
                );
                db.updateGift.mockResolvedValueOnce({
                    recipientId: 'r1' as RecipientId,
                });

                await usecase.execute(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(db.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'Marc' } }),
                );
            });

            it('allows an existing recipient to be replaced', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() - 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'recipient-1' as RecipientId }),
                    ),
                );
                db.updateGift.mockResolvedValueOnce({
                    recipientId: 'r2' as RecipientId,
                });

                await usecase.execute(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Sofia',
                } as UpdateSaleDto);

                expect(db.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'Sofia' } }),
                );
            });
        });

        describe('when no status is sent at all and the match has kicked off', () => {
            it('allows the update', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() - 60_000),
                        SaleStatus.GIFTED,
                        giftFixture(),
                    ),
                );

                await usecase.execute(userId, {
                    saleId,
                    listedPrice: 150,
                } as UpdateSaleDto);

                expect(db.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ listedPrice: 150 }),
                );

                expect(db.updateSale.mock.calls[0]?.[0]).not.toHaveProperty('status');
            });
        });

        describe('when the sale is SOLD and the target is GIFTED', () => {
            it('rejects the update', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.SOLD),
                );

                await expect(
                    usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.SOLD),
                );

                await expect(
                    usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.CANCELLED),
                );

                await expect(
                    usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture(),
                    ),
                );

                await expect(
                    usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture(),
                    ),
                );

                await expect(
                    usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.PENDING),
                );
                db.giftSale.mockResolvedValueOnce({
                    recipientId: 'r1' as RecipientId,
                });

                await usecase.execute(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(db.giftSale).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'Marc' } }),
                );
            });
        });

        describe('when the sale is SOLD and the target is PENDING after kickoff', () => {
            it('allows the update', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.SOLD),
                );

                await usecase.execute(userId, {
                    saleId,
                    status: 'PENDING',
                } as UpdateSaleDto);

                expect(db.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'PENDING' }),
                );
            });
        });

        describe('when the sale is CANCELLED and the target is PENDING after kickoff', () => {
            it('allows the update', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.CANCELLED),
                );

                await usecase.execute(userId, {
                    saleId,
                    status: 'PENDING',
                } as UpdateSaleDto);

                expect(db.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'PENDING' }),
                );
            });
        });

        describe('when the target is GIFTED with no recipient', () => {
            it('rejects the update', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await expect(
                    usecase.execute(userId, {
                        saleId,
                        status: 'GIFTED',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED,
                });
            });

            it('does not write the sale', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await expect(
                    usecase.execute(userId, {
                        saleId,
                        status: 'GIFTED',
                    } as UpdateSaleDto),
                ).rejects.toThrow(DomainException);

                expect(db.giftSale).not.toHaveBeenCalled();
            });
        });

        describe('when the sale is already GIFTED and the status is resubmitted unchanged with no recipient in the request', () => {
            beforeEach(() => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r9' as RecipientId }),
                    ),
                );
                db.updateGift.mockResolvedValue({
                    recipientId: 'r9' as RecipientId,
                });
            });

            it('does not throw', async () => {
                await expect(
                    usecase.execute(userId, {
                        saleId,
                        status: 'GIFTED',
                        listedPrice: 150 as ListedPrice,
                    } as UpdateSaleDto),
                ).resolves.toBeUndefined();
            });

            it('does not look up or create a recipient', async () => {
                await usecase.execute(userId, {
                    saleId,
                    status: 'GIFTED',
                    listedPrice: 150 as ListedPrice,
                } as UpdateSaleDto);

                expect(recipientsDbService.findByNameForUser).not.toHaveBeenCalled();
                expect(recipientsDbService.create).not.toHaveBeenCalled();
            });

            it('updates the other fields without sending a recipient patch', async () => {
                await usecase.execute(userId, {
                    saleId,
                    status: 'GIFTED',
                    listedPrice: 150 as ListedPrice,
                } as UpdateSaleDto);

                const callArg = db.updateGift.mock.calls[0]![0];

                expect(callArg).toMatchObject({ listedPrice: 150 });
                expect(callArg).not.toHaveProperty('recipient');
            });
        });

        describe('when the sale is already GIFTED and a new recipient is supplied', () => {
            it('resolves and updates the recipient', async () => {
                db.getOneSale.mockResolvedValue(
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

                await usecase.execute(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientId: 'r10' as RecipientId,
                } as UpdateSaleDto);

                expect(db.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientId: 'r10' } }),
                );
            });
        });

        describe('when recipientId is sent for an existing recipient owned by the user', () => {
            it('uses the id directly, without a name lookup', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );
                recipientsDbService.findByIdForUser.mockResolvedValueOnce({
                    id: 'r5' as RecipientId,
                    userId,
                    name: 'Marc',
                });

                await usecase.execute(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientId: 'r5' as RecipientId,
                } as UpdateSaleDto);

                expect(recipientsDbService.findByIdForUser).toHaveBeenCalledWith(
                    'r5',
                    userId,
                );
                expect(recipientsDbService.findByNameForUser).not.toHaveBeenCalled();
                expect(db.giftSale).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientId: 'r5' } }),
                );
            });
        });

        describe('when recipientId is sent for a recipient that does not belong to the user', () => {
            beforeEach(() => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );
                recipientsDbService.findByIdForUser.mockResolvedValueOnce(null);
            });

            it('rejects the update instead of writing another user’s recipient', async () => {
                await expect(
                    usecase.execute(userId, {
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
                    usecase.execute(userId, {
                        saleId,
                        status: 'GIFTED',
                        recipientId: 'someone-elses-recipient' as RecipientId,
                    } as UpdateSaleDto),
                ).rejects.toThrow(DomainException);

                expect(db.giftSale).not.toHaveBeenCalled();
            });
        });

        // Resolve-or-create by name (existing vs. new) is a db-layer concern
        // now — it runs inside the sale-write transaction so a failed write
        // can't orphan a newly-created recipient (finding 6). See
        // src/api/sales/usecases/update-sale/update-sale.usecase.db.spec.ts
        // for that resolution behavior; this layer's job is only to pass the
        // normalized name through.
        describe('when a recipient name is given', () => {
            it('trims and collapses whitespace before sending it to the db layer', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await usecase.execute(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: '  Chloé   Dupont  ',
                } as UpdateSaleDto);

                expect(db.giftSale).toHaveBeenCalledWith(
                    expect.objectContaining({
                        recipient: { recipientName: 'Chloé Dupont' },
                    }),
                );
            });

            it('does not resolve it itself', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValueOnce(
                    saleFixture(new Date(Date.now() + 86_400_000), SaleStatus.PENDING),
                );

                await expect(
                    usecase.execute(userId, {
                        saleId,
                        recipientName: 'Marc',
                    } as UpdateSaleDto),
                ).rejects.toThrow(DomainException);

                expect(db.updateSale).not.toHaveBeenCalled();
                expect(db.giftSale).not.toHaveBeenCalled();
                expect(db.updateGift).not.toHaveBeenCalled();
            });
        });

        describe('when a PENDING sale is gifted before kickoff', () => {
            it('calls giftSale and never the generic update', async () => {
                db.getOneSale.mockResolvedValueOnce(
                    saleFixture(new Date(Date.now() + 86_400_000)),
                );
                db.giftSale.mockResolvedValueOnce({
                    recipientId: 'r1' as RecipientId,
                });

                await usecase.execute(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(db.giftSale).toHaveBeenCalledWith(
                    expect.objectContaining({
                        saleId,
                        userId,
                        recipient: { recipientName: 'Marc' },
                    }),
                );
                expect(db.updateSale).not.toHaveBeenCalled();
            });
        });

        describe('when an already-GIFTED sale gets a new recipient after kickoff', () => {
            it('calls updateGift and sends no status', async () => {
                db.getOneSale.mockResolvedValueOnce(
                    saleFixture(
                        new Date(Date.now() - 86_400_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r1' as RecipientId }),
                    ),
                );
                db.updateGift.mockResolvedValueOnce({
                    recipientId: 'r2' as RecipientId,
                });

                await usecase.execute(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Ana',
                } as UpdateSaleDto);

                expect(db.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'Ana' } }),
                );
                expect(db.giftSale).not.toHaveBeenCalled();
                expect(db.updateSale).not.toHaveBeenCalled();
            });

            it('invalidates the recipients cache when the recipient changed', async () => {
                db.getOneSale.mockResolvedValueOnce(
                    saleFixture(
                        new Date(Date.now() - 86_400_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r1' as RecipientId }),
                    ),
                );
                db.updateGift.mockResolvedValueOnce({
                    recipientId: 'r2' as RecipientId,
                });

                await usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValueOnce(
                    saleFixture(
                        new Date(Date.now() - 86_400_000),
                        SaleStatus.GIFTED,
                        giftFixture({
                            recipientId: 'r1' as RecipientId,
                            Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                        }),
                    ),
                );
                db.updateGift.mockResolvedValueOnce({
                    recipientId: 'r2' as RecipientId,
                });

                await usecase.execute(userId, {
                    saleId,
                    recipientName: 'NewName',
                } as UpdateSaleDto);

                expect(db.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'NewName' } }),
                );
                expect(db.giftSale).not.toHaveBeenCalled();
                expect(db.updateSale).not.toHaveBeenCalled();
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
                db.getOneSale.mockResolvedValueOnce(
                    saleFixture(new Date(Date.now() + 86_400_000)),
                );

                await usecase.execute(userId, {
                    saleId,
                    status: 'SOLD',
                } as UpdateSaleDto);

                expect(db.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'SOLD' }),
                );
                expect(db.giftSale).not.toHaveBeenCalled();
            });
        });
    });

    describe('updateSale recipients cache invalidation', () => {
        describe('when the sale enters GIFTED', () => {
            it('invalidates the recipients cache', async () => {
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );
                db.giftSale.mockResolvedValueOnce({
                    recipientId: 'r1' as RecipientId,
                });

                await usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r9' as RecipientId }),
                    ),
                );
                db.updateGift.mockResolvedValueOnce({
                    recipientId: 'r10' as RecipientId,
                });

                await usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValue(
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
                db.updateGift.mockResolvedValueOnce({
                    recipientId: 'r10' as RecipientId,
                });

                await usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValue(
                    saleFixture(
                        new Date(Date.now() + 60_000),
                        SaleStatus.GIFTED,
                        giftFixture({ recipientId: 'r9' as RecipientId }),
                    ),
                );
                db.updateGift.mockResolvedValueOnce({
                    recipientId: 'r9' as RecipientId,
                });

                await usecase.execute(userId, {
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
                db.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await usecase.execute(userId, {
                    saleId,
                    listedPrice: 150 as ListedPrice,
                } as UpdateSaleDto);

                expect(redisService.invalidatePattern).not.toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
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
                db.getOneSale.mockResolvedValue(saleFixture(futureMatchDate));
                matchesDbService.getOneMatch.mockResolvedValue(
                    matchFixture(new Date('2024-09-15')),
                );
                seasonPassesDbService.findById.mockResolvedValue(
                    passFixture({ seasonStartYear: 2023 }),
                );
            });

            it('rejects the update with SALE_ALLOCATION_PASS_MISMATCH', async () => {
                await expect(usecase.execute(userId, payload)).rejects.toMatchObject({
                    code: ErrorCode.SALE_ALLOCATION_PASS_MISMATCH,
                });
            });

            it('does not write the sale', async () => {
                await expect(usecase.execute(userId, payload)).rejects.toThrow(
                    DomainException,
                );

                expect(db.updateSale).not.toHaveBeenCalled();
            });
        });

        describe('when the pass belongs to the same season as the match', () => {
            beforeEach(() => {
                db.getOneSale.mockResolvedValue(saleFixture(futureMatchDate));
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
                    usecase.execute(userId, {
                        saleId,
                        allocations,
                    } as UpdateSaleDto),
                ).resolves.toBeUndefined();

                expect(db.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ saleId, userId, allocations }),
                );
            });
        });
    });
});
