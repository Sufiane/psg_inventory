import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { SalesCacheInvalidator } from './sales-cache.invalidator';
import { RedisService } from '../../../redis/redis.service';
import CACHE_KEYS from '../../../redis/CACHE_KEYS';
import { saleId, userId } from '../test-support/sales.fixtures';

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

        module.useLogger(false);
        invalidator = module.get(SalesCacheInvalidator);
    });

    describe('afterWrite', () => {
        describe('when redis works', () => {
            it('invalidates sales, the sale key and accounting', async () => {
                await invalidator.afterWrite(userId, saleId, { recipientChanged: false });

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateSales(userId),
                );
                expect(redisService.invalidate).toHaveBeenCalledWith(
                    CACHE_KEYS.sale(userId, saleId),
                );
                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateAccounting(userId),
                );
            });
        });

        describe('when the recipient changed', () => {
            it('also invalidates the recipients cache', async () => {
                await invalidator.afterWrite(userId, saleId, { recipientChanged: true });

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when the recipient did not change', () => {
            it('does not invalidate the recipients cache', async () => {
                await invalidator.afterWrite(userId, saleId, { recipientChanged: false });

                expect(redisService.invalidatePattern).not.toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when no sale id is given', () => {
            it('skips the per-sale key', async () => {
                await invalidator.afterWrite(userId, undefined, {
                    recipientChanged: false,
                });

                expect(redisService.invalidate).not.toHaveBeenCalled();
                expect(redisService.invalidatePattern).toHaveBeenCalledTimes(2);
            });
        });

        describe('when the sales pattern invalidation rejects', () => {
            beforeEach(() => {
                redisService.invalidatePattern.mockRejectedValueOnce(
                    new Error('redis down'),
                );
            });

            it('resolves and still runs every other invalidation', async () => {
                await expect(
                    invalidator.afterWrite(userId, saleId, { recipientChanged: true }),
                ).resolves.toBeUndefined();

                expect(redisService.invalidate).toHaveBeenCalledWith(
                    CACHE_KEYS.sale(userId, saleId),
                );
                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateAccounting(userId),
                );
                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when the sale key invalidation rejects', () => {
            beforeEach(() => {
                redisService.invalidate.mockRejectedValue(new Error('redis down'));
            });

            it('resolves and still runs the pattern invalidations', async () => {
                await expect(
                    invalidator.afterWrite(userId, saleId, { recipientChanged: true }),
                ).resolves.toBeUndefined();

                expect(redisService.invalidatePattern).toHaveBeenCalledTimes(3);
            });
        });

        describe('when the accounting invalidation rejects', () => {
            beforeEach(() => {
                redisService.invalidatePattern.mockImplementation((pattern) =>
                    pattern === CACHE_KEYS.invalidateAccounting(userId)
                        ? Promise.reject(new Error('redis down'))
                        : Promise.resolve(),
                );
            });

            it('resolves and still invalidates recipients', async () => {
                await expect(
                    invalidator.afterWrite(userId, saleId, { recipientChanged: true }),
                ).resolves.toBeUndefined();

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when the recipients invalidation rejects', () => {
            beforeEach(() => {
                redisService.invalidatePattern.mockImplementation((pattern) =>
                    pattern === CACHE_KEYS.invalidateRecipients(userId)
                        ? Promise.reject(new Error('redis down'))
                        : Promise.resolve(),
                );
            });

            it('resolves', async () => {
                await expect(
                    invalidator.afterWrite(userId, saleId, { recipientChanged: true }),
                ).resolves.toBeUndefined();
            });
        });
    });
});
