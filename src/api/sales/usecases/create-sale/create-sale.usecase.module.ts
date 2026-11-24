import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../db/prisma.module';
import { RedisModule } from '../../../../redis/redis.module';
import { RecipientsDbModule } from '../../../../db/recipients/recipients.db.module';
import { MatchesDbModule } from '../../../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../../../db/season-passes/season-passes.db.module';
import { CreateSaleUsecase, ICreateSaleUsecase } from './create-sale.usecase';
import { CreateSaleUsecaseDb, ICreateSaleUsecaseDb } from './create-sale.usecase.db';
import { SaleAllocationsValidator } from '../../shared/sale-allocations.validator';
import { GiftRecipientResolver } from '../../shared/gift-recipient.resolver';
import { SalesCacheInvalidator } from '../../shared/sales-cache.invalidator';

@Module({
    imports: [
        PrismaModule,
        RedisModule,
        MatchesDbModule,
        SeasonPassesDbModule,
        RecipientsDbModule,
    ],
    providers: [
        { provide: ICreateSaleUsecaseDb, useClass: CreateSaleUsecaseDb },
        { provide: ICreateSaleUsecase, useClass: CreateSaleUsecase },
        SaleAllocationsValidator,
        GiftRecipientResolver,
        SalesCacheInvalidator,
    ],
    exports: [ICreateSaleUsecase],
})
export class CreateSaleUsecaseModule {}
