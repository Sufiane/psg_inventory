import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../db/prisma.module';
import { RedisModule } from '../../../../redis/redis.module';
import { SalesDbModule } from '../../../../db/sales/sales.db.module';
import { RecipientsDbModule } from '../../../../db/recipients/recipients.db.module';
import { MatchesDbModule } from '../../../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../../../db/season-passes/season-passes.db.module';
import { IUpdateSaleUsecase, UpdateSaleUsecase } from './update-sale.usecase';
import { IUpdateSaleUsecaseDb, UpdateSaleUsecaseDb } from './update-sale.usecase.db';
import { SaleAllocationsValidator } from '../../shared/sale-allocations.validator';
import { SalesCacheInvalidator } from '../../shared/sales-cache.invalidator';

@Module({
    imports: [
        PrismaModule,
        RedisModule,
        SalesDbModule,
        RecipientsDbModule,
        MatchesDbModule,
        SeasonPassesDbModule,
    ],
    providers: [
        { provide: IUpdateSaleUsecaseDb, useClass: UpdateSaleUsecaseDb },
        { provide: IUpdateSaleUsecase, useClass: UpdateSaleUsecase },
        SaleAllocationsValidator,
        SalesCacheInvalidator,
    ],
    exports: [IUpdateSaleUsecase],
})
export class UpdateSaleUsecaseModule {}
