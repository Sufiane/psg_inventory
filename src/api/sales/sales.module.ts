import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesDbModule } from '../../db/sales/sales.db.module';
import { MatchesDbModule } from '../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { RecipientsDbModule } from '../../db/recipients/recipients.db.module';
import { RedisModule } from '../../redis/redis.module';
import { ISalesService } from './interfaces/sales.service.interface';
import {
    IUngiftSaleUsecase,
    UngiftSaleUsecase,
} from './usecases/ungift-sale/ungift-sale.usecase';
import {
    IUngiftSaleUsecaseDb,
    UngiftSaleUsecaseDb,
} from './usecases/ungift-sale/ungift-sale.usecase.db';
import {
    IDeleteSaleUsecase,
    DeleteSaleUsecase,
} from './usecases/delete-sale/delete-sale.usecase';
import {
    IDeleteSaleUsecaseDb,
    DeleteSaleUsecaseDb,
} from './usecases/delete-sale/delete-sale.usecase.db';

@Module({
    imports: [
        SalesDbModule,
        MatchesDbModule,
        SeasonPassesDbModule,
        RecipientsDbModule,
        RedisModule,
    ],
    controllers: [SalesController],
    providers: [
        { provide: ISalesService, useClass: SalesService },
        { provide: IUngiftSaleUsecaseDb, useClass: UngiftSaleUsecaseDb },
        { provide: IUngiftSaleUsecase, useClass: UngiftSaleUsecase },
        { provide: IDeleteSaleUsecaseDb, useClass: DeleteSaleUsecaseDb },
        { provide: IDeleteSaleUsecase, useClass: DeleteSaleUsecase },
    ],
})
export class SalesModule {}
