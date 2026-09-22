import { Injectable } from '@nestjs/common';

import type { UserId } from '@psg/shared/ids';
import CACHE_KEYS from '../../../redis/CACHE_KEYS';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class SalesCacheInvalidator {
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
}
