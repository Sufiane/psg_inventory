import { Module } from '@nestjs/common';

import { AccountingDbModule } from '../../../../db/accounting/accounting.db.module';
import { SalesDbModule } from '../../../../db/sales/sales.db.module';
import { SeasonPassesDbModule } from '../../../../db/season-passes/season-passes.db.module';
import { RedisModule } from '../../../../redis/redis.module';
import {
    GetSeasonAccountingUsecase,
    IGetSeasonAccountingUsecase,
} from './get-season-accounting.usecase';
import {
    GetSeasonAccountingUsecaseDb,
    IGetSeasonAccountingUsecaseDb,
} from './get-season-accounting.usecase.db';

@Module({
    imports: [AccountingDbModule, SalesDbModule, SeasonPassesDbModule, RedisModule],
    providers: [
        {
            provide: IGetSeasonAccountingUsecaseDb,
            useClass: GetSeasonAccountingUsecaseDb,
        },
        { provide: IGetSeasonAccountingUsecase, useClass: GetSeasonAccountingUsecase },
    ],
    exports: [IGetSeasonAccountingUsecase],
})
export class GetSeasonAccountingUsecaseModule {}
