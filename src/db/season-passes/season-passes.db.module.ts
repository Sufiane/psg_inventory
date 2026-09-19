import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { SeasonPassesDb } from './season-passes.db';
import { ISeasonPassesDbService } from './season-passes.db.interface';

@Module({
    imports: [PrismaModule, RedisModule],
    providers: [{ provide: ISeasonPassesDbService, useClass: SeasonPassesDb }],
    exports: [ISeasonPassesDbService],
})
export class SeasonPassesDbModule {}
