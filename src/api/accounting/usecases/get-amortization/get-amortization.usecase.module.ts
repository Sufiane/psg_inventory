import { Module } from '@nestjs/common';

import { AccountingDbModule } from '../../../../db/accounting/accounting.db.module';
import { SeasonPassesDbModule } from '../../../../db/season-passes/season-passes.db.module';
import { RedisModule } from '../../../../redis/redis.module';
import {
    GetAmortizationUsecase,
    IGetAmortizationUsecase,
} from './get-amortization.usecase';
import {
    GetAmortizationUsecaseDb,
    IGetAmortizationUsecaseDb,
} from './get-amortization.usecase.db';

@Module({
    imports: [AccountingDbModule, SeasonPassesDbModule, RedisModule],
    providers: [
        {
            provide: IGetAmortizationUsecaseDb,
            useClass: GetAmortizationUsecaseDb,
        },
        { provide: IGetAmortizationUsecase, useClass: GetAmortizationUsecase },
    ],
    exports: [IGetAmortizationUsecase],
})
export class GetAmortizationUsecaseModule {}
