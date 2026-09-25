import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AccountingDbModule } from '../../db/accounting/accounting.db.module';
import { SalesDbModule } from '../../db/sales/sales.db.module';
import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { RedisModule } from '../../redis/redis.module';
import { IAccountingService } from './interfaces/accounting.service.interface';
import { GetSeasonAccountingUsecaseModule } from './usecases/get-season-accounting/get-season-accounting.usecase.module';

@Module({
    imports: [
        AccountingDbModule,
        SalesDbModule,
        SeasonPassesDbModule,
        RedisModule,
        GetSeasonAccountingUsecaseModule,
    ],
    controllers: [AccountingController],
    providers: [{ provide: IAccountingService, useClass: AccountingService }],
    exports: [IAccountingService],
})
export class AccountingModule {}
