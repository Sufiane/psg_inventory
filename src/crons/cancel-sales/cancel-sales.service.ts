import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ISalesDbService } from '../../db/sales/sales.db.interface';

@Injectable()
export class CancelSalesService {
    constructor(private readonly salesDbService: ISalesDbService) {}

    @Cron('0 0 * * *')
    async cancelSales() {
        await this.salesDbService.cancelMany();
    }
}
