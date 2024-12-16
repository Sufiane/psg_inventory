import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { SalesService as SalesDbService } from '../../db/sales/sales.service';

@Injectable()
export class CancelSalesService {
    constructor(private readonly salesDbService: SalesDbService) {}

    @Cron('0 0 * * *')
    async cancelSales() {
        await this.salesDbService.cancelMany();
    }
}
