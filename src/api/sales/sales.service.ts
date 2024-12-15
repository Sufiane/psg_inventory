import { Injectable } from '@nestjs/common';
import { SalesService as SalesDbService } from '../../db/sales.service';
import { AddSaleDto } from './dto/add-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { omit } from 'radash';

const PSG_COMMISSION = 12;

@Injectable()
export class SalesService {
    constructor(private readonly salesDbService: SalesDbService) {}

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

    async addSale(userId: string, payload: AddSaleDto): Promise<void> {
        await this.salesDbService.addSale({
            userId,
            ...payload,
            profit: this.getProfit(payload.listedPrice),
        });
    }

    async updateSale(userId: string, payload: UpdateSaleDto): Promise<void> {
        await this.salesDbService.updateSale({
            userId,
            ...payload,
            profit: payload.listedPrice ? this.getProfit(payload.listedPrice) : undefined,
        });
    }

    getProfit(price: number): number {
        return (price * (100 - PSG_COMMISSION)) / 100;
    }

    async deleteSale(userId: string, saleId: string) {
        await this.salesDbService.deleteSale(userId, saleId);
    }
}
