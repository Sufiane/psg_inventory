import { Injectable, Logger } from '@nestjs/common';

import type { SaleId, UserId } from '@psg/shared/ids';
import CACHE_KEYS from '../../../redis/CACHE_KEYS';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class SalesCacheInvalidator {
    private readonly logger = new Logger(SalesCacheInvalidator.name);

    constructor(private readonly redisService: RedisService) {}

    async afterWrite(
        userId: UserId,
        saleId: SaleId | undefined,
        options: { recipientChanged: boolean },
    ): Promise<void> {
        await this.invalidateQuietly(userId, 'sales_cache_invalidation_failed', () =>
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId)),
        );

        if (saleId != null) {
            await this.invalidateQuietly(userId, 'sale_cache_invalidation_failed', () =>
                this.redisService.invalidate(CACHE_KEYS.sale(userId, saleId)),
            );
        }

        await this.invalidateQuietly(userId, 'accounting_cache_invalidation_failed', () =>
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateAccounting(userId)),
        );

        // The combobox orders by giftCount, which only moves when a gift is
        // created, retargeted or destroyed.
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

    // The write is already committed; a Redis failure must not turn it into a
    // 500 (on create, that invites a duplicate-creating retry). TTLs bound staleness.
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
