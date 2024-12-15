import { CancelSalesService } from './cancel-sales.service';
import { Controller, Logger, Post } from '@nestjs/common';

@Controller('/cron/cancel-sales')
export class CancelSalesController {
    private readonly logger = new Logger(CancelSalesController.name);

    constructor(private readonly service: CancelSalesService) {}

    @Post()
    async forceCancelSales() {
        this.logger.log('Force cancelling sales...');

        await this.service.cancelSales();
    }
}
