import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CancelSalesModule } from './cancel-sales/cancel-sales.module';

@Module({
    imports: [ScheduleModule.forRoot(), CancelSalesModule],
})
export class CronModule {}
