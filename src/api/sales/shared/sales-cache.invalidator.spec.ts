import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { SalesCacheInvalidator } from './sales-cache.invalidator';
import { RedisService } from '../../../redis/redis.service';
import CACHE_KEYS from '../../../redis/CACHE_KEYS';
import { userId } from '../test-support/sales.fixtures';

describe('SalesCacheInvalidator', () => {
    let invalidator: SalesCacheInvalidator;
    let redisService: DeepMockProxy<RedisService>;

    beforeEach(async () => {
        redisService = mockDeep<RedisService>();
        const module = await Test.createTestingModule({
            providers: [
                SalesCacheInvalidator,
                { provide: RedisService, useValue: redisService },
            ],
        }).compile();

        invalidator = module.get(SalesCacheInvalidator);
    });

    it('always invalidates the accounting cache', async () => {
        await invalidator.afterWrite(userId, { recipientChanged: false });

        expect(redisService.invalidatePattern).toHaveBeenCalledWith(
            CACHE_KEYS.invalidateAccounting(userId),
        );
    });

    describe('when the recipient changed', () => {
        it('also invalidates the recipients cache', async () => {
            await invalidator.afterWrite(userId, { recipientChanged: true });

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        });
    });

    describe('when the recipient did not change', () => {
        it('does not invalidate the recipients cache', async () => {
            await invalidator.afterWrite(userId, { recipientChanged: false });

            expect(redisService.invalidatePattern).not.toHaveBeenCalledWith(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        });
    });
});
