import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesDbModule } from '../../db/sales/sales.db.module';
import { MatchesDbModule } from '../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { RecipientsDbModule } from '../../db/recipients/recipients.db.module';
import { RedisModule } from '../../redis/redis.module';
import { ISalesService } from './interfaces/sales.service.interface';
import { UpdateSaleUsecaseModule } from './usecases/update-sale/update-sale.usecase.module';
import { SaleAllocationsValidator } from './shared/sale-allocations.validator';
import { UngiftSaleUsecaseModule } from './usecases/ungift-sale/ungift-sale.usecase.module';
import { DeleteSaleUsecaseModule } from './usecases/delete-sale/delete-sale.usecase.module';

@Module({
    imports: [
        SalesDbModule,
        MatchesDbModule,
        SeasonPassesDbModule,
        RecipientsDbModule,
        RedisModule,
        UpdateSaleUsecaseModule,
        UngiftSaleUsecaseModule,
        DeleteSaleUsecaseModule,
    ],
    controllers: [SalesController],
    providers: [
        { provide: ISalesService, useClass: SalesService },
        SaleAllocationsValidator,
    ],
})
export class SalesModule {}
