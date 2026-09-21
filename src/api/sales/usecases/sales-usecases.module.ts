import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../db/prisma.module';
import { RedisModule } from '../../../redis/redis.module';
import { IUngiftSaleUsecase, UngiftSaleUsecase } from './ungift-sale/ungift-sale.usecase';
import {
    IUngiftSaleUsecaseDb,
    UngiftSaleUsecaseDb,
} from './ungift-sale/ungift-sale.usecase.db';
import { IDeleteSaleUsecase, DeleteSaleUsecase } from './delete-sale/delete-sale.usecase';
import {
    IDeleteSaleUsecaseDb,
    DeleteSaleUsecaseDb,
} from './delete-sale/delete-sale.usecase.db';

@Module({
    imports: [PrismaModule, RedisModule],
    providers: [
        { provide: IUngiftSaleUsecaseDb, useClass: UngiftSaleUsecaseDb },
        { provide: IUngiftSaleUsecase, useClass: UngiftSaleUsecase },
        { provide: IDeleteSaleUsecaseDb, useClass: DeleteSaleUsecaseDb },
        { provide: IDeleteSaleUsecase, useClass: DeleteSaleUsecase },
    ],
    exports: [IUngiftSaleUsecase, IDeleteSaleUsecase],
})
export class SalesUsecasesModule {}
