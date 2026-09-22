import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { ImportCacheInvalidator } from './import-cache.invalidator';
import { RedisService } from '../../../redis/redis.service';
import CACHE_KEYS from '../../../redis/CACHE_KEYS';
import type { UserId } from '@psg/shared/ids';

describe('ImportCacheInvalidator', () => {
    let invalidator: ImportCacheInvalidator;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'user-1' as UserId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                ImportCacheInvalidator,
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        invalidator = module.get(ImportCacheInvalidator);
        redisService = module.get(RedisService);

        module.useLogger(false);
    });

    it('invalidates the accounting and recipients caches', async () => {
        await invalidator.afterWrite(userId);

        expect(redisService.invalidatePattern).toHaveBeenCalledTimes(2);
        expect(redisService.invalidatePattern).toHaveBeenCalledWith(
            CACHE_KEYS.invalidateAccounting(userId),
        );
        expect(redisService.invalidatePattern).toHaveBeenCalledWith(
            CACHE_KEYS.invalidateRecipients(userId),
        );
    });

    it('does not propagate a redis failure (Promise.allSettled semantics)', async () => {
        redisService.invalidatePattern.mockRejectedValue(new Error('redis down'));

        await expect(invalidator.afterWrite(userId)).resolves.toBeUndefined();
    });
});
