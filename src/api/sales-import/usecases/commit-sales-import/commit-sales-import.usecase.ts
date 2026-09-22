import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';

import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice } from '@psg/shared/money';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import type { BulkSaleGiftInput } from '../../../../db/sales-import/sales-import.db.interface';
import { normalizeRecipientName } from '../../../../shared/utils/recipient-name.util';
import { computeProfit } from '../../../sales/shared/profit.util';
import { CommitRequestDto } from '../../dto/commit-request.dto';
import { DraftRowDto } from '../../dto/draft-row.dto';
import { validateCommitRows } from '../../sales-import.resolver';
import { dateOnlyToUtcNoon } from '../../utils/date-only.util';
import { ImportCacheInvalidator } from '../../shared/import-cache.invalidator';
import { ImportPassesValidator } from '../../shared/import-passes.validator';
import { ICommitSalesImportUsecaseDb } from './commit-sales-import.usecase.db';

export type CommitResult = {
    batchId: string;
    salesCreated: number;
};

export abstract class ICommitSalesImportUsecase {
    abstract execute(userId: UserId, dto: CommitRequestDto): Promise<CommitResult>;
}

// The commit half of the CSV sales import (spec 2026-06-20): validate the
// selection, re-resolve every row server-side, then write the whole batch
// under one fresh batchId. Extracted from SalesImportService.commit
// (PSG-26); the pipeline below is byte-identical to what that method ran.
@Injectable()
export class CommitSalesImportUsecase implements ICommitSalesImportUsecase {
    constructor(
        private readonly db: ICommitSalesImportUsecaseDb,
        private readonly passesValidator: ImportPassesValidator,
        private readonly cacheInvalidator: ImportCacheInvalidator,
    ) {}

    async execute(userId: UserId, dto: CommitRequestDto): Promise<CommitResult> {
        const seasonStartYear = await this.passesValidator.validate(
            userId,
            dto.selectedPassIds,
        );
        const homeMatches = await this.db.getHomeMatchesForSeason(seasonStartYear);
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
            profit: computeProfit(row.listedPrice as ListedPrice),
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

        const salesCreated = await this.db.bulkCreate({
            userId,
            batchId,
            sales,
        });

        if (salesCreated > 0) {
            await this.cacheInvalidator.afterWrite(userId);
        }

        return { batchId, salesCreated };
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
