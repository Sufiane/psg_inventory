import { Test } from '@nestjs/testing';
import { omit } from 'radash';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { CreateSaleUsecase, ICreateSaleUsecase } from './create-sale.usecase';
import { ICreateSaleUsecaseDb } from './create-sale.usecase.db';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { CreateSaleDto } from '../../dto/create-sale.dto';
import { GiftRecipientResolver } from '../../shared/gift-recipient.resolver';
import { SaleAllocationsValidator } from '../../shared/sale-allocations.validator';
import { SalesCacheInvalidator } from '../../shared/sales-cache.invalidator';
import { computeProfit } from '../../shared/profit.util';
import { matchId, passId, userId } from '../../test-support/sales.fixtures';
import type { TicketCount } from '@psg/shared/counts';
import type { RecipientId, SaleId } from '@psg/shared/ids';
import type { Invest, ListedPrice } from '@psg/shared/money';

describe('CreateSaleUsecase', () => {
    let usecase: ICreateSaleUsecase;
    let db: DeepMockProxy<ICreateSaleUsecaseDb>;
    let validator: DeepMockProxy<SaleAllocationsValidator>;
    let resolver: DeepMockProxy<GiftRecipientResolver>;
    let invalidator: DeepMockProxy<SalesCacheInvalidator>;

    const newSaleId = 'new-sale' as SaleId;
    const price = 100 as ListedPrice;
    const futureDate = new Date('2026-09-01T18:00:00.000Z');
    const pastDate = new Date('2026-03-01T18:00:00.000Z');

    const basePayload: CreateSaleDto = {
        matchId,
        allocations: [{ seasonPassId: passId, nbTickets: 2 as TicketCount }],
        listedPrice: price,
        invest: 10 as Invest,
    };

    const withoutPrice = omit(basePayload, ['listedPrice']);

    beforeEach(async () => {
        vi.useFakeTimers().setSystemTime(new Date('2026-06-01T12:00:00.000Z'));

        const module = await Test.createTestingModule({
            providers: [
                CreateSaleUsecase,
                {
                    provide: ICreateSaleUsecaseDb,
                    useValue: mockDeep<ICreateSaleUsecaseDb>(),
                },
                {
                    provide: SaleAllocationsValidator,
                    useValue: mockDeep<SaleAllocationsValidator>(),
                },
                {
                    provide: GiftRecipientResolver,
                    useValue: mockDeep<GiftRecipientResolver>(),
                },
                {
                    provide: SalesCacheInvalidator,
                    useValue: mockDeep<SalesCacheInvalidator>(),
                },
            ],
        }).compile();

        usecase = module.get(CreateSaleUsecase);
        db = module.get(ICreateSaleUsecaseDb);
        validator = module.get(SaleAllocationsValidator);
        resolver = module.get(GiftRecipientResolver);
        invalidator = module.get(SalesCacheInvalidator);

        db.createSale.mockResolvedValue({ id: newSaleId, recipientId: null });
        db.getMatchDate.mockResolvedValue(futureDate);
        resolver.resolveNew.mockResolvedValue({ recipientName: 'Marc' });

        module.useLogger(false);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('when the status is omitted', () => {
        it('creates a PENDING sale with the computed profit', async () => {
            await usecase.execute(userId, basePayload);

            expect(db.createSale).toHaveBeenCalledWith({
                userId,
                matchId,
                status: 'PENDING',
                listedPrice: price,
                profit: computeProfit(price),
                invest: basePayload.invest,
                allocations: basePayload.allocations,
                recipient: undefined,
            });
        });

        it('validates the allocations', async () => {
            await usecase.execute(userId, basePayload);

            expect(validator.validate).toHaveBeenCalledWith(
                userId,
                matchId,
                basePayload.allocations,
            );
        });

        it('invalidates caches without recipients', async () => {
            await usecase.execute(userId, basePayload);

            expect(invalidator.afterWrite).toHaveBeenCalledWith(userId, {
                recipientChanged: false,
            });
        });

        it('returns the new id', async () => {
            const result = await usecase.execute(userId, basePayload);

            expect(result).toEqual({ id: newSaleId });
        });

        it('does not load the match date', async () => {
            await usecase.execute(userId, basePayload);

            expect(db.getMatchDate).not.toHaveBeenCalled();
        });
    });

    describe('when the status is PENDING and the price is missing', () => {
        it('rejects', async () => {
            await expect(
                usecase.execute(userId, { ...withoutPrice, status: 'PENDING' }),
            ).rejects.toMatchObject({ code: ErrorCode.SALE_LISTED_PRICE_REQUIRED });
        });

        it('writes nothing', async () => {
            await usecase.execute(userId, withoutPrice).catch(() => undefined);

            expect(db.createSale).not.toHaveBeenCalled();
        });
    });

    describe('when the status is SOLD', () => {
        describe('and the price is sent', () => {
            it('creates a SOLD sale', async () => {
                await usecase.execute(userId, { ...basePayload, status: 'SOLD' });

                expect(db.createSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'SOLD', listedPrice: price }),
                );
            });
        });

        describe('and the price is missing', () => {
            it('rejects', async () => {
                await expect(
                    usecase.execute(userId, { ...withoutPrice, status: 'SOLD' }),
                ).rejects.toMatchObject({ code: ErrorCode.SALE_LISTED_PRICE_REQUIRED });
            });
        });
    });

    describe('when the status is GIFTED', () => {
        const giftPayload: CreateSaleDto = {
            ...basePayload,
            status: 'GIFTED',
            recipientName: 'Marc',
        };

        describe('and no price is sent', () => {
            const giftWithoutPrice = omit(giftPayload, ['listedPrice']);

            beforeEach(() => {
                db.createSale.mockResolvedValue({
                    id: newSaleId,
                    recipientId: 'r1' as RecipientId,
                });
            });

            it('passes no price and no profit', async () => {
                await usecase.execute(userId, giftWithoutPrice);

                expect(db.createSale).toHaveBeenCalledWith(
                    expect.objectContaining({
                        status: 'GIFTED',
                        listedPrice: undefined,
                        profit: undefined,
                        recipient: { recipientName: 'Marc' },
                    }),
                );
            });

            it('resolves the recipient from the name', async () => {
                await usecase.execute(userId, giftWithoutPrice);

                expect(resolver.resolveNew).toHaveBeenCalledWith(userId, {
                    recipientName: 'Marc',
                });
            });

            it('invalidates caches including recipients', async () => {
                await usecase.execute(userId, giftWithoutPrice);

                expect(invalidator.afterWrite).toHaveBeenCalledWith(userId, {
                    recipientChanged: true,
                });
            });
        });

        describe('and a price is sent', () => {
            it('stores the price and the computed profit', async () => {
                await usecase.execute(userId, giftPayload);

                expect(db.createSale).toHaveBeenCalledWith(
                    expect.objectContaining({
                        listedPrice: price,
                        profit: computeProfit(price),
                    }),
                );
            });
        });

        describe('and the recipient name is blank', () => {
            beforeEach(() => {
                resolver.resolveNew.mockRejectedValue(
                    Object.assign(new Error('required'), {
                        code: ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED,
                    }),
                );
            });

            it('rejects', async () => {
                await expect(
                    usecase.execute(userId, { ...giftPayload, recipientName: ' ' }),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED,
                });
            });

            it('writes nothing', async () => {
                await usecase
                    .execute(userId, { ...giftPayload, recipientName: ' ' })
                    .catch(() => undefined);

                expect(db.createSale).not.toHaveBeenCalled();
            });
        });
    });

    describe('when a recipient name is sent for a non-gift', () => {
        it.each(['PENDING', 'SOLD'] as const)('rejects for %s', async (status) => {
            await expect(
                usecase.execute(userId, {
                    ...basePayload,
                    status,
                    recipientName: 'Marc',
                }),
            ).rejects.toMatchObject({
                code: ErrorCode.SALE_GIFT_RECIPIENT_NOT_APPLICABLE,
            });
        });
    });

    describe('when the match has kicked off', () => {
        beforeEach(() => {
            db.getMatchDate.mockResolvedValue(pastDate);
        });

        it('rejects a SOLD sale', async () => {
            await expect(
                usecase.execute(userId, { ...basePayload, status: 'SOLD' }),
            ).rejects.toMatchObject({ code: ErrorCode.SALE_AFTER_KICKOFF });
        });

        it('rejects a GIFTED sale', async () => {
            await expect(
                usecase.execute(userId, {
                    ...basePayload,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                }),
            ).rejects.toMatchObject({ code: ErrorCode.SALE_AFTER_KICKOFF });
        });

        it('allows a PENDING sale without loading the match date', async () => {
            await usecase.execute(userId, { ...basePayload, status: 'PENDING' });

            expect(db.getMatchDate).not.toHaveBeenCalled();
            expect(db.createSale).toHaveBeenCalledTimes(1);
        });
    });

    describe('when the match is missing for a SOLD sale', () => {
        beforeEach(() => {
            db.getMatchDate.mockResolvedValue(null);
        });

        it('rejects', async () => {
            await expect(
                usecase.execute(userId, { ...basePayload, status: 'SOLD' }),
            ).rejects.toMatchObject({ code: ErrorCode.MATCH_NOT_FOUND });
        });
    });

    describe('when the allocations are invalid', () => {
        beforeEach(() => {
            validator.validate.mockRejectedValue(
                Object.assign(new Error('invalid'), {
                    code: ErrorCode.SALE_INVALID_ALLOCATIONS,
                }),
            );
        });

        it('rejects with the validator error', async () => {
            await expect(usecase.execute(userId, basePayload)).rejects.toMatchObject({
                code: ErrorCode.SALE_INVALID_ALLOCATIONS,
            });
        });

        it('writes nothing', async () => {
            await usecase.execute(userId, basePayload).catch(() => undefined);

            expect(db.createSale).not.toHaveBeenCalled();
        });
    });

    describe('when the write fails', () => {
        beforeEach(() => {
            db.createSale.mockRejectedValue(new Error('db down'));
        });

        it('rejects with the error', async () => {
            await expect(usecase.execute(userId, basePayload)).rejects.toThrow('db down');
        });

        it('does not invalidate caches', async () => {
            await usecase.execute(userId, basePayload).catch(() => undefined);

            expect(invalidator.afterWrite).not.toHaveBeenCalled();
        });
    });
});
