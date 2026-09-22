import { Module } from '@nestjs/common';

import { MatchesDbModule } from '../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { SalesImportDbModule } from '../../db/sales-import/sales-import.db.module';
import { RedisModule } from '../../redis/redis.module';
import { SalesImportController } from './sales-import.controller';
import { SalesImportService } from './sales-import.service';
import { ImportCacheInvalidator } from './shared/import-cache.invalidator';
import { ImportPassesValidator } from './shared/import-passes.validator';
import { CommitSalesImportUsecaseModule } from './usecases/commit-sales-import/commit-sales-import.usecase.module';

@Module({
    imports: [
        MatchesDbModule,
        SeasonPassesDbModule,
        RedisModule,
        SalesImportDbModule,
        CommitSalesImportUsecaseModule,
    ],
    controllers: [SalesImportController],
    providers: [SalesImportService, ImportPassesValidator, ImportCacheInvalidator],
})
export class SalesImportModule {}
