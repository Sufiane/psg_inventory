import { Injectable } from '@nestjs/common';

import type { SaleId, UserId } from '@psg/shared/ids';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { Sale } from '../../../../db/sales/type/sale.type';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';

export abstract class IUngiftSaleUsecaseDb {
    abstract loadSale(userId: UserId, saleId: SaleId): Promise<Sale | null>;
    abstract ungiftSale(userId: UserId, saleId: SaleId): Promise<void>;
}

@Injectable()
export class UngiftSaleUsecaseDb implements IUngiftSaleUsecaseDb {
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly redisService: RedisService,
    ) {}

    async loadSale(userId: UserId, saleId: SaleId): Promise<Sale | null> {
        return this.salesDbService.getOneSale(userId, saleId);
    }

    async ungiftSale(userId: UserId, saleId: SaleId): Promise<void> {
        await this.salesDbService.ungiftSale(userId, saleId);

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateRecipients(userId),
        );
    }
}
