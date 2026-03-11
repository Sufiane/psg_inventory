import { Injectable } from '@nestjs/common';
import { SalesService as SalesDbService } from '../../db/sales/sales.service';
import { AddSaleDto } from './dto/add-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { omit } from 'radash';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { PSG_COMMISSION } from '../../shared/constants';

@Injectable()
export class SalesService {
    constructor(
        private readonly salesDbService: SalesDbService,
        private readonly redisService: RedisService,
    ) {}

    getSale(userId: string, saleId: string) {
        return this.salesDbService.getOneSale(userId, saleId);
    }

    async getSales(userId: string) {
        const sales = await this.salesDbService.getSales(userId);

        return sales.map((sale) => {
            return {
                ...omit(sale, ['Match', 'userId', 'matchId']),
                opponent: {
                    id: sale.Match.Opponent.id,
                    name: sale.Match.Opponent.name,
                },
            };
        });
    }

    async addSale(userId: string, payload: AddSaleDto): Promise<{ id: string }> {
        const sale = await this.salesDbService.addSale({
            userId,
            ...payload,
            profit: this.getProfit(payload.listedPrice),
        });

        return { id: sale.id };
    }

    async updateSale(userId: string, payload: UpdateSaleDto): Promise<void> {
        await this.salesDbService.updateSale({
            userId,
            ...payload,
            profit: payload.listedPrice ? this.getProfit(payload.listedPrice) : undefined,
        });

        await this.redisService.invalidate(CACHE_KEYS.invalidateAccounting(userId));
    }

    getProfit(price: number): number {
        return (price * (100 - PSG_COMMISSION)) / 100;
    }

    async deleteSale(userId: string, saleId: string) {
        await this.salesDbService.deleteSale(userId, saleId);

        await this.redisService.invalidate(CACHE_KEYS.invalidateAccounting(userId));
    }
}
