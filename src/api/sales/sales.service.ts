import { Injectable } from '@nestjs/common';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { AddSaleDto } from './dto/add-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { omit } from 'radash';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { PSG_COMMISSION } from '../../shared/constants';
import { FormattedSale, ISalesService } from './interfaces/sales.service.interface';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { Sale } from '../../db/sales/type/sale.type';

@Injectable()
export class SalesService implements ISalesService {
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly redisService: RedisService,
    ) {}

    async getSale(userId: string, saleId: string) {
        const sale = await this.salesDbService.getOneSale(userId, saleId);

        if (!sale) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        return sale;
    }

    async getSales(userId: string): Promise<FormattedSale[]> {
        const sales = await this.salesDbService.getSales(userId);

        return sales.map((sale) => this.formatSale(sale));
    }

    async getCurrentSeasonSales(userId: string): Promise<FormattedSale[]> {
        const { start, end } = getCurrentSeasonDate();
        const sales = await this.salesDbService.getSalesByRange(userId, {
            from: start,
            to: end,
        });

        return sales.map((sale) => this.formatSale(sale));
    }

    async getSeasonSales(
        userId: string,
        seasonStartYear: number,
    ): Promise<FormattedSale[]> {
        const from = new Date(seasonStartYear, 7, 1);
        const to = new Date(seasonStartYear + 1, 7, 1);
        const sales = await this.salesDbService.getSalesByRange(userId, { from, to });

        return sales.map((sale) => this.formatSale(sale));
    }

    private formatSale(sale: Sale): FormattedSale {
        return {
            ...omit(sale, ['Match', 'userId', 'matchId']),
            opponent: {
                id: sale.Match.Opponent.id,
                name: sale.Match.Opponent.name,
            },
        };
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

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
    }

    getProfit(price: number): number {
        return (price * (100 - PSG_COMMISSION)) / 100;
    }

    async deleteSale(userId: string, saleId: string) {
        await this.salesDbService.deleteSale(userId, saleId);

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
    }
}
