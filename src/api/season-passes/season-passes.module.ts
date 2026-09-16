import { Module } from '@nestjs/common';

import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { RedisModule } from '../../redis/redis.module';
import { ISeasonPassesService } from './interfaces/season-passes.service.interface';
import { SeasonPassesController } from './season-passes.controller';
import { SeasonPassesService } from './season-passes.service';

@Module({
    imports: [SeasonPassesDbModule, RedisModule],
    controllers: [SeasonPassesController],
    providers: [{ provide: ISeasonPassesService, useClass: SeasonPassesService }],
    exports: [ISeasonPassesService],
})
export class SeasonPassesModule {}
