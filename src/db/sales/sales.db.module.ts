import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { SalesDb } from './sales.db';
import { ISalesDbService } from './sales.db.interface';

@Module({
    imports: [PrismaModule, RedisModule],
    providers: [{ provide: ISalesDbService, useClass: SalesDb }],
    exports: [ISalesDbService],
})
export class SalesDbModule {}
