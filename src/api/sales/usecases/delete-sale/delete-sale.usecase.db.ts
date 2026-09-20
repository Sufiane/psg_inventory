import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';

import type { SaleId, UserId } from '@psg/shared/ids';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { Sale } from '../../../../db/sales/type/sale.type';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';

export abstract class IDeleteSaleUsecaseDb {
    abstract loadSale(userId: UserId, saleId: SaleId): Promise<Sale | null>;
    abstract deleteSale(
        userId: UserId,
        saleId: SaleId,
        saleStatus: SaleStatus,
    ): Promise<void>;
}

@Injectable()
export class DeleteSaleUsecaseDb implements IDeleteSaleUsecaseDb {
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly redisService: RedisService,
    ) {}

    async loadSale(userId: UserId, saleId: SaleId): Promise<Sale | null> {
        return this.salesDbService.getOneSale(userId, saleId);
    }

    async deleteSale(
        userId: UserId,
        saleId: SaleId,
        saleStatus: SaleStatus,
    ): Promise<void> {
        await this.salesDbService.deleteSale(userId, saleId);

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );

        // Deleting a GIFTED sale destroys its gift row with it (ON DELETE
        // CASCADE plus the explicit delete in the db layer), which moves the
        // recipient's giftCount — the combobox's sort key.
        if (saleStatus === SaleStatus.GIFTED) {
            await this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        }
    }
}
