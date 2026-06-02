import { CancelSalesService } from './cancel-sales.service';
import { Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../shared/guards/role.guard';

@Controller('/cron/cancel-sales')
@UseGuards(RolesGuard)
export class CancelSalesController {
    private readonly logger = new Logger(CancelSalesController.name);

    constructor(private readonly service: CancelSalesService) {}

    @Post()
    async forceCancelSales(): Promise<void> {
        this.logger.log('Force cancelling sales...');

        await this.service.cancelSales();
    }
}
