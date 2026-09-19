import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { RecipientsDbModule } from '../recipients/recipients.db.module';
import { RedisModule } from '../../redis/redis.module';
import { SalesDb } from './sales.db';
import { ISalesDbService } from './sales.db.interface';

@Module({
    imports: [PrismaModule, RecipientsDbModule, RedisModule],
    providers: [{ provide: ISalesDbService, useClass: SalesDb }],
    exports: [ISalesDbService],
})
export class SalesDbModule {}
