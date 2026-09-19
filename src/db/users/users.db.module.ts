import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { UsersDb } from './users.db';
import { IUsersDbService } from './users.db.interface';

@Module({
    imports: [PrismaModule, RedisModule],
    providers: [{ provide: IUsersDbService, useClass: UsersDb }],
    exports: [IUsersDbService],
})
export class UsersDbModule {}
