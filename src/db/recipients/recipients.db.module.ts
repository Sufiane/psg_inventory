import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { RecipientsDb } from './recipients.db';
import { IRecipientsDbService } from './recipients.db.interface';

@Module({
    imports: [PrismaModule, RedisModule],
    providers: [{ provide: IRecipientsDbService, useClass: RecipientsDb }],
    exports: [IRecipientsDbService],
})
export class RecipientsDbModule {}
