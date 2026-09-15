import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import type { RecipientId, UserId } from '@psg/shared/ids';
import { RecipientsService as RecipientsDbService } from '../../db/recipients/recipients.service';
import { IRecipientsDbService } from '../../db/recipients/recipients.db.interface';
import { RecipientsService } from './recipients.service';

describe('RecipientsService (api)', () => {
    const userId = 'user-1' as UserId;
    let service: RecipientsService;
    let recipientsDbService: DeepMockProxy<RecipientsDbService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                RecipientsService,
                {
                    provide: IRecipientsDbService,
                    useValue: mockDeep<RecipientsDbService>(),
                },
            ],
        }).compile();

        service = module.get(RecipientsService);
        recipientsDbService = module.get(IRecipientsDbService);

        module.useLogger(false);
    });

    describe('when the user has recipients', () => {
        it('orders them by gift count then name', async () => {
            recipientsDbService.listForUser.mockResolvedValueOnce([
                { id: 'r1' as RecipientId, userId, name: 'Ana', giftCount: 1 },
                { id: 'r2' as RecipientId, userId, name: 'Marc', giftCount: 3 },
                { id: 'r3' as RecipientId, userId, name: 'Bo', giftCount: 1 },
            ]);

            const result = await service.list(userId);

            expect(result).toEqual([
                { id: 'r2', name: 'Marc', giftCount: 3 },
                { id: 'r1', name: 'Ana', giftCount: 1 },
                { id: 'r3', name: 'Bo', giftCount: 1 },
            ]);
        });
    });

    describe('when the user has no recipients', () => {
        it('returns an empty list', async () => {
            recipientsDbService.listForUser.mockResolvedValueOnce([]);

            await expect(service.list(userId)).resolves.toEqual([]);
        });
    });
});
