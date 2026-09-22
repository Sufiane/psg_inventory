import { Injectable } from '@nestjs/common';

import type { UserId } from '@psg/shared/ids';
import CACHE_KEYS from '../../../redis/CACHE_KEYS';
import { RedisService } from '../../../redis/redis.service';

// A committed or reverted batch can create or destroy GIFTED rows, so
// every cache an ordinary sale write would touch (spec D15,
// SalesService.updateSale's own invalidateAfterWrite) has to move here
// too. The sales list/detail cache is invalidated by the db layer
// (src/db/sales-import/sales-import.db.ts), mirroring how
// src/db/sales/sales.db.ts owns its own row-shaped caches; accounting
// and the recipients list (its giftCount sort key) are derived views only
// the api layer knows changed — invalidated unconditionally rather than
// trying to work out from the batch contents whether a recipient's count
// actually moved, since a wrong "no" here is a stale combobox for up to an
// hour and the extra invalidation call costs nothing on this rare a path.
// Moved verbatim from SalesImportService.invalidateImportCaches (PSG-26):
// CommitSalesImportUsecase and SalesImportService.revert both call it.
@Injectable()
export class ImportCacheInvalidator {
    constructor(private readonly redisService: RedisService) {}

    async afterWrite(userId: UserId): Promise<void> {
        await Promise.allSettled([
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateAccounting(userId)),
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateRecipients(userId)),
        ]);
    }
}
