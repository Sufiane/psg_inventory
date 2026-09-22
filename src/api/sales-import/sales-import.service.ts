import { Injectable } from '@nestjs/common';

import type { UserId } from '@psg/shared/ids';

import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { ISalesImportDbService } from '../../db/sales-import/sales-import.db.interface';
import { CommitRequestDto } from './dto/commit-request.dto';
import { PreviewResponse } from './dto/preview-response.dto';
import { parseImportCsv } from './sales-import.csv';
import { resolveDraftRows } from './sales-import.resolver';
import {
    CommitResult,
    ICommitSalesImportUsecase,
} from './usecases/commit-sales-import/commit-sales-import.usecase';
import { ImportCacheInvalidator } from './shared/import-cache.invalidator';
import { ImportPassesValidator } from './shared/import-passes.validator';

export type { CommitResult };

@Injectable()
export class SalesImportService {
    constructor(
        private readonly matchesDb: IMatchesDbService,
        private readonly salesImportDb: ISalesImportDbService,
        private readonly passesValidator: ImportPassesValidator,
        private readonly cacheInvalidator: ImportCacheInvalidator,
        private readonly commitSalesImportUsecase: ICommitSalesImportUsecase,
    ) {}

    async preview(
        userId: UserId,
        buffer: Buffer,
        selectedPassIds: string[],
    ): Promise<PreviewResponse> {
        const parsed = parseImportCsv(buffer);

        if (parsed.kind === 'error') {
            throw new DomainException(ErrorCode.IMPORT_CSV_INVALID);
        }

        const seasonStartYear = await this.passesValidator.validate(
            userId,
            selectedPassIds,
        );
        const homeMatches = await this.matchesDb.getHomeMatchesForSeason(seasonStartYear);
        const resolved = resolveDraftRows({
            rawRows: parsed.rows,
            homeMatches,
            selectedPassIds,
        });

        return {
            rows: resolved.rows,
            summary: resolved.summary,
            missingMatches: resolved.missingMatches,
            seasonStartYear,
        };
    }

    async commit(userId: UserId, dto: CommitRequestDto): Promise<CommitResult> {
        return this.commitSalesImportUsecase.execute(userId, dto);
    }

    async revert(userId: UserId, batchId: string): Promise<{ deleted: number }> {
        const deleted = await this.salesImportDb.deleteBatch(userId, batchId);

        if (deleted > 0) {
            await this.cacheInvalidator.afterWrite(userId);
        }

        return { deleted };
    }
}
