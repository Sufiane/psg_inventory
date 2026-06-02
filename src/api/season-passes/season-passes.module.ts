import { Module } from '@nestjs/common';

import { DbModule } from '../../db/db.module';
import { RedisModule } from '../../redis/redis.module';
import { ISeasonPassesService } from './interfaces/season-passes.service.interface';
import { SeasonPassesController } from './season-passes.controller';
import { SeasonPassesService } from './season-passes.service';

@Module({
    imports: [DbModule, RedisModule],
    controllers: [SeasonPassesController],
    providers: [{ provide: ISeasonPassesService, useClass: SeasonPassesService }],
    exports: [ISeasonPassesService],
})
export class SeasonPassesModule {}
