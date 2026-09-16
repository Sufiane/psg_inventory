import { Module } from '@nestjs/common';
import { CancelSalesController } from './cancel-sales.controller';
import { CancelSalesService } from './cancel-sales.service';
import { SalesDbModule } from '../../db/sales/sales.db.module';

@Module({
    imports: [SalesDbModule],
    controllers: [CancelSalesController],
    providers: [CancelSalesService],
})
export class CancelSalesModule {}
