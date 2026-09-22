import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../db/prisma.module';
import { RedisModule } from '../../../../redis/redis.module';
import { IUngiftSaleUsecase, UngiftSaleUsecase } from './ungift-sale.usecase';
import { IUngiftSaleUsecaseDb, UngiftSaleUsecaseDb } from './ungift-sale.usecase.db';

@Module({
    imports: [PrismaModule, RedisModule],
    providers: [
        { provide: IUngiftSaleUsecaseDb, useClass: UngiftSaleUsecaseDb },
        { provide: IUngiftSaleUsecase, useClass: UngiftSaleUsecase },
    ],
    exports: [IUngiftSaleUsecase],
})
export class UngiftSaleUsecaseModule {}
