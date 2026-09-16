import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';

import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';

import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import {
    BulkSaleGiftInput,
    ISalesImportDbService,
} from '../../db/sales-import/sales-import.db.interface';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { PSG_COMMISSION } from '../../shared/constants';
import { normalizeRecipientName } from '../../shared/utils/recipient-name.util';
import { CommitRequestDto } from './dto/commit-request.dto';
import { DraftRowDto } from './dto/draft-row.dto';
import { PreviewResponse } from './dto/preview-response.dto';
import { parseImportCsv } from './sales-import.csv';
import { resolveDraftRows, validateCommitRows } from './sales-import.resolver';
import { dateOnlyToUtcNoon } from './utils/date-only.util';

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
        private readonly redisService: RedisService,
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

        const matchDates = new Map(homeMatches.map((match) => [match.id, match.date]));

        const batchId = randomUUID();
        const sales = validated.rows.map((row) => ({
            matchId: row.matchId! as MatchId,
            listedPrice: row.listedPrice as ListedPrice,
            invest: row.invest as Invest,
            profit: this.computeProfit(row.listedPrice),
            nbTickets: row.nbTickets as TicketCount,
            status: row.status,
            soldAt:
                row.status === 'SOLD' && row.soldAt != null
                    ? dateOnlyToUtcNoon(row.soldAt)
                    : null,
            gift: this.buildGiftInput(row, matchDates),
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

        if (salesCreated > 0) {
            await this.invalidateImportCaches(userId);
        }

        return { batchId, salesCreated };
    }

    async revert(userId: UserId, batchId: string): Promise<{ deleted: number }> {
        const deleted = await this.salesImportDb.deleteBatch(userId, batchId);

        if (deleted > 0) {
            await this.invalidateImportCaches(userId);
        }

        return { deleted };
    }

    // A committed or reverted batch can create or destroy GIFTED rows, so
    // every cache an ordinary sale write would touch (spec D15,
    // SalesService.updateSale's own invalidateAfterWrite) has to move here
    // too. The sales list/detail cache is invalidated by the db layer
    // (src/db/sales-import/sales-import.db.ts), mirroring how
    // src/db/sales/sales.db.ts owns its own row-shaped caches; accounting
    // and the recipients list (its giftCount sort key) are derived views only
    // the api layer knows changed — invalidated unconditionally rather than
    // trying to work out from the batch contents whether a recipient's count
    // actually moved, since a wrong "no" here is a stale combobox for up to an
    // hour and the extra invalidation call costs nothing on this rare a path.
    private async invalidateImportCaches(userId: UserId): Promise<void> {
        await Promise.allSettled([
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateAccounting(userId)),
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateRecipients(userId)),
        ]);
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

    // Non-null exactly for a GIFTED row. A row that carries its own date uses
    // it, pinned to noon UTC exactly like soldAt; a row without one falls back
    // to the match's real stored date rather than the same day at noon —
    // "given away, date unknown" is not representable, and the match is the
    // date the gift was for (spec D10). validateCommitRows has already guaranteed both a
    // recipient and a resolvable match for every GIFTED row that reaches
    // here (a row without either is error:gift-recipient-missing or
    // error:match-missing and never commits), so the throw below is a
    // fail-loud backstop, not a path the app can reach.
    private buildGiftInput(
        row: DraftRowDto,
        matchDates: Map<string, Date>,
    ): BulkSaleGiftInput | null {
        if (row.status !== 'GIFTED') {
            return null;
        }

        const recipientName = normalizeRecipientName(row.recipient ?? '');
        const giftedAt =
            row.soldAt != null
                ? dateOnlyToUtcNoon(row.soldAt)
                : matchDates.get(row.matchId!);

        if (recipientName.length === 0 || giftedAt == null) {
            throw new DomainException(ErrorCode.IMPORT_ROWS_INVALID);
        }

        return { recipientName, giftedAt };
    }
}
