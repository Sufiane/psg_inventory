import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesDbModule } from '../../db/sales/sales.db.module';
import { MatchesDbModule } from '../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { RecipientsDbModule } from '../../db/recipients/recipients.db.module';
import { RedisModule } from '../../redis/redis.module';
import { ISalesService } from './interfaces/sales.service.interface';
import { SalesUsecasesModule } from './usecases/sales-usecases.module';
import { UpdateSaleUsecaseModule } from './usecases/update-sale/update-sale.usecase.module';
import { SaleAllocationsValidator } from './shared/sale-allocations.validator';

@Module({
    imports: [
        SalesDbModule,
        MatchesDbModule,
        SeasonPassesDbModule,
        RecipientsDbModule,
        RedisModule,
        SalesUsecasesModule,
        UpdateSaleUsecaseModule,
    ],
    controllers: [SalesController],
    providers: [
        { provide: ISalesService, useClass: SalesService },
        SaleAllocationsValidator,
    ],
})
export class SalesModule {}
