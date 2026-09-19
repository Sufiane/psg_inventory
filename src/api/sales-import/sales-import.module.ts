import { Module } from '@nestjs/common';

import { MatchesDbModule } from '../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { SalesImportDbModule } from '../../db/sales-import/sales-import.db.module';
import { RedisModule } from '../../redis/redis.module';
import { SalesImportController } from './sales-import.controller';
import { SalesImportService } from './sales-import.service';

@Module({
    imports: [MatchesDbModule, SeasonPassesDbModule, RedisModule, SalesImportDbModule],
    controllers: [SalesImportController],
    providers: [SalesImportService],
})
export class SalesImportModule {}
