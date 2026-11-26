import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../db/prisma.module';
import { RedisModule } from '../../../../redis/redis.module';
import { IDeleteSaleUsecase, DeleteSaleUsecase } from './delete-sale.usecase';
import { SalesCacheInvalidator } from '../../shared/sales-cache.invalidator';
import { IDeleteSaleUsecaseDb, DeleteSaleUsecaseDb } from './delete-sale.usecase.db';

@Module({
    imports: [PrismaModule, RedisModule],
    providers: [
        { provide: IDeleteSaleUsecaseDb, useClass: DeleteSaleUsecaseDb },
        { provide: IDeleteSaleUsecase, useClass: DeleteSaleUsecase },
        SalesCacheInvalidator,
    ],
    exports: [IDeleteSaleUsecase],
})
export class DeleteSaleUsecaseModule {}
