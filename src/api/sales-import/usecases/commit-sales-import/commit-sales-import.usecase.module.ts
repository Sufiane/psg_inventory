import { Module } from '@nestjs/common';

import { MatchesDbModule } from '../../../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../../../db/season-passes/season-passes.db.module';
import { SalesImportDbModule } from '../../../../db/sales-import/sales-import.db.module';
import { RedisModule } from '../../../../redis/redis.module';
import { ImportCacheInvalidator } from '../../shared/import-cache.invalidator';
import { ImportPassesValidator } from '../../shared/import-passes.validator';
import {
    CommitSalesImportUsecase,
    ICommitSalesImportUsecase,
} from './commit-sales-import.usecase';
import {
    CommitSalesImportUsecaseDb,
    ICommitSalesImportUsecaseDb,
} from './commit-sales-import.usecase.db';

@Module({
    imports: [MatchesDbModule, SeasonPassesDbModule, RedisModule, SalesImportDbModule],
    providers: [
        { provide: ICommitSalesImportUsecaseDb, useClass: CommitSalesImportUsecaseDb },
        { provide: ICommitSalesImportUsecase, useClass: CommitSalesImportUsecase },
        ImportPassesValidator,
        ImportCacheInvalidator,
    ],
    exports: [ICommitSalesImportUsecase],
})
export class CommitSalesImportUsecaseModule {}
