import { Module } from '@nestjs/common';
import { CancelSalesController } from './cancel-sales.controller';
import { CancelSalesService } from './cancel-sales.service';
import { DbModule } from '../../db/db.module';

@Module({
    imports: [DbModule],
    controllers: [CancelSalesController],
    providers: [CancelSalesService],
})
export class CancelSalesModule {
}
