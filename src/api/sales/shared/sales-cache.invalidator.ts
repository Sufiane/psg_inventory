import { Injectable, Logger } from '@nestjs/common';

import type { UserId } from '@psg/shared/ids';
import CACHE_KEYS from '../../../redis/CACHE_KEYS';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class SalesCacheInvalidator {
    private readonly logger = new Logger(SalesCacheInvalidator.name);

    constructor(private readonly redisService: RedisService) {}

    async afterWrite(
        userId: UserId,
        options: { recipientChanged: boolean },
    ): Promise<void> {
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );

        // The combobox orders by giftCount, which only moves when a gift is
        // created, retargeted or destroyed.
        if (options.recipientChanged) {
            await this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        }
    }

    async afterCreate(
        userId: UserId,
        options: { recipientChanged: boolean },
    ): Promise<void> {
        await this.invalidateQuietly(userId, 'sales_cache_invalidation_failed', () =>
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId)),
        );
        await this.invalidateQuietly(userId, 'accounting_cache_invalidation_failed', () =>
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateAccounting(userId)),
        );

        if (options.recipientChanged) {
            await this.invalidateQuietly(
                userId,
                'recipients_cache_invalidation_failed',
                () =>
                    this.redisService.invalidatePattern(
                        CACHE_KEYS.invalidateRecipients(userId),
                    ),
            );
        }
    }

    // The sale is already committed; a Redis failure must not turn it into a
    // 500 that invites a duplicate-creating retry. Cache TTLs bound staleness.
    private async invalidateQuietly(
        userId: UserId,
        label: string,
        operation: () => Promise<unknown>,
    ): Promise<void> {
        try {
            await operation();
        } catch (error) {
            this.logger.warn(`${label} for user ${userId}: ${String(error)}`);
        }
    }
}
