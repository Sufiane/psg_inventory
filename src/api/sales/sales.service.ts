import { Injectable } from '@nestjs/common';
import { SalesService as SalesDbService } from '../../db/sales.service';
import { AddSaleDto } from './dto/add-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';

const PSG_COMMISSION = 12;

@Injectable()
export class SalesService {
    constructor(private readonly salesDbService: SalesDbService) {
    }

    getSale(userId: string, saleId: string) {
        return this.salesDbService.getOneSale(userId, saleId);
    }

    getSales(userId: string) {
        return this.salesDbService.getSales(userId);
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
            profit: payload.listedPrice
                ? this.getProfit(payload.listedPrice)
                : undefined,
        });
    }

    getProfit(price: number): number {
        return price * (1 - PSG_COMMISSION);
    }

    async deleteSale(userId: string, saleId: string) {
        await this.salesDbService.deleteSale(userId, saleId);
    }
}
