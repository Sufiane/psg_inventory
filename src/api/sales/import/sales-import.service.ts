import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';

import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';

import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { IMatchesDbService } from '../../../db/matches/matches.db.interface';
import { ISalesImportDbService } from '../../../db/sales-import/sales-import.db.interface';
import { ISeasonPassesDbService } from '../../../db/season-passes/season-passes.db.interface';
import { PSG_COMMISSION } from '../../../shared/constants';
import { CommitRequestDto } from './dto/commit-request.dto';
import { PreviewResponse } from './dto/preview-response.dto';
import { parseImportCsv } from './sales-import.csv';
import { resolveDraftRows, validateCommitRows } from './sales-import.resolver';

export type CommitResult = {
    batchId: string;
    salesCreated: number;
};

@Injectable()
export class SalesImportService {
    constructor(
        private readonly matchesDb: IMatchesDbService,
        private readonly seasonPassesDb: ISeasonPassesDbService,
        private readonly salesImportDb: ISalesImportDbService,
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

        const seasonStartYear = await this.assertPasses(userId, selectedPassIds);
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
        const seasonStartYear = await this.assertPasses(userId, dto.selectedPassIds);
        const homeMatches = await this.matchesDb.getHomeMatchesForSeason(seasonStartYear);
        const validated = validateCommitRows({
            rows: dto.rows,
            homeMatches,
            selectedPassIds: dto.selectedPassIds,
        });

        if (validated.summary.errors > 0) {
            throw new DomainException(ErrorCode.IMPORT_ROWS_INVALID);
        }

        const batchId = randomUUID();
        const sales = validated.rows.map((row) => ({
            matchId: row.matchId! as MatchId,
            listedPrice: row.listedPrice as ListedPrice,
            invest: row.invest as Invest,
            profit: this.computeProfit(row.listedPrice),
            nbTickets: row.nbTickets as TicketCount,
            status: row.status as SaleStatus,
            allocations: row.allocations.map((allocation) => ({
                seasonPassId: allocation.seasonPassId as SeasonPassId,
                nbTickets: allocation.nbTickets as TicketCount,
            })),
        }));

        const salesCreated = await this.salesImportDb.bulkCreate({
            userId,
            batchId,
            sales,
        });

        return { batchId, salesCreated };
    }

    async revert(userId: UserId, batchId: string): Promise<{ deleted: number }> {
        const deleted = await this.salesImportDb.deleteBatch(userId, batchId);

        return { deleted };
    }

    private async assertPasses(
        userId: UserId,
        selectedPassIds: string[],
    ): Promise<SeasonYear> {
        const passes = await Promise.all(
            selectedPassIds.map((id) => this.seasonPassesDb.findById(id as SeasonPassId)),
        );
        const years = new Set<number>();

        for (const pass of passes) {
            if (pass == null) {
                throw new DomainException(ErrorCode.SEASON_PASS_NOT_FOUND);
            }

            if (pass.userId !== userId) {
                throw new DomainException(ErrorCode.SEASON_PASS_FORBIDDEN);
            }

            years.add(pass.seasonStartYear);
        }

        if (years.size !== 1) {
            throw new DomainException(ErrorCode.IMPORT_PASSES_MIXED_SEASONS);
        }

        return [...years][0]! as SeasonYear;
    }

    private computeProfit(price: number): Profit {
        return ((price * (100 - PSG_COMMISSION)) / 100) as Profit;
    }
}
