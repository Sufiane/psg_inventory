import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import type { RecipientId } from '@psg/shared/ids';
import { GiftRecipientResolver } from './gift-recipient.resolver';
import { IRecipientsDbService } from '../../../db/recipients/recipients.db.interface';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { userId } from '../test-support/sales.fixtures';

describe('GiftRecipientResolver', () => {
    const recipientId = 'r9' as RecipientId;
    let resolver: GiftRecipientResolver;
    let recipientsDbService: DeepMockProxy<IRecipientsDbService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                GiftRecipientResolver,
                {
                    provide: IRecipientsDbService,
                    useValue: mockDeep<IRecipientsDbService>(),
                },
            ],
        }).compile();

        resolver = module.get(GiftRecipientResolver);
        recipientsDbService = module.get(IRecipientsDbService);
    });

    describe('resolveNew', () => {
        describe('when a recipient id is given', () => {
            describe('and the recipient is owned', () => {
                beforeEach(() => {
                    recipientsDbService.findByIdForUser.mockResolvedValue({
                        id: recipientId,
                    } as never);
                });

                it('returns the recipient id', async () => {
                    await expect(
                        resolver.resolveNew(userId, { recipientId }),
                    ).resolves.toEqual({ recipientId });
                });
            });

            describe('and the recipient is not owned', () => {
                beforeEach(() => {
                    recipientsDbService.findByIdForUser.mockResolvedValue(null);
                });

                it('rejects with recipient not found', async () => {
                    await expect(
                        resolver.resolveNew(userId, { recipientId }),
                    ).rejects.toMatchObject({
                        code: ErrorCode.SALE_GIFT_RECIPIENT_NOT_FOUND,
                    });
                });
            });
        });

        describe('when a name is given', () => {
            it('returns the normalised name', async () => {
                await expect(
                    resolver.resolveNew(userId, { recipientName: '  Marc   Dupont ' }),
                ).resolves.toEqual({ recipientName: 'Marc Dupont' });
            });
        });

        describe('when the name is blank or missing', () => {
            it('rejects when the name is blank', async () => {
                await expect(
                    resolver.resolveNew(userId, { recipientName: '   ' }),
                ).rejects.toMatchObject({ code: ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED });
            });

            it('rejects when the name is missing', async () => {
                await expect(resolver.resolveNew(userId, {})).rejects.toMatchObject({
                    code: ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED,
                });
            });
        });
    });

    describe('resolveExisting', () => {
        describe('when a recipient id is given', () => {
            describe('and the recipient is owned', () => {
                beforeEach(() => {
                    recipientsDbService.findByIdForUser.mockResolvedValue({
                        id: recipientId,
                    } as never);
                });

                it('returns the recipient id', async () => {
                    await expect(
                        resolver.resolveExisting(userId, { recipientId }),
                    ).resolves.toEqual({ recipientId });
                });
            });

            describe('and the recipient is not owned', () => {
                beforeEach(() => {
                    recipientsDbService.findByIdForUser.mockResolvedValue(null);
                });

                it('rejects with recipient not found', async () => {
                    await expect(
                        resolver.resolveExisting(userId, { recipientId }),
                    ).rejects.toMatchObject({
                        code: ErrorCode.SALE_GIFT_RECIPIENT_NOT_FOUND,
                    });
                });
            });
        });

        describe('when a name is given', () => {
            it('returns the normalised name', async () => {
                await expect(
                    resolver.resolveExisting(userId, { recipientName: ' Marc  Dupont' }),
                ).resolves.toEqual({ recipientName: 'Marc Dupont' });
            });
        });

        describe('when the name is blank', () => {
            it('returns undefined', async () => {
                await expect(
                    resolver.resolveExisting(userId, { recipientName: '  ' }),
                ).resolves.toBeUndefined();
            });
        });
    });
});
