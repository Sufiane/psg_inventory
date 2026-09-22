import { Injectable } from '@nestjs/common';

import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { IMatchesDbService } from '../../../../db/matches/matches.db.interface';
import type { Match } from '../../../../db/matches/types/match.type';
import {
    BulkSaleInput,
    ISalesImportDbService,
} from '../../../../db/sales-import/sales-import.db.interface';

// The commit usecase's entire db surface: exactly the two queries commit
// runs (PSG-26) — deliberately NOT the full ISalesImportDbService, which
// also carries deleteBatch for revert. It wraps the existing db tokens and
// never talks to Prisma directly: SalesImportDb stays the single
// implementation of the bulk transaction, so nothing is duplicated here.
export abstract class ICommitSalesImportUsecaseDb {
    abstract getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]>;
    abstract bulkCreate(payload: {
        userId: UserId;
        batchId: string;
        sales: BulkSaleInput[];
    }): Promise<number>;
}

@Injectable()
export class CommitSalesImportUsecaseDb implements ICommitSalesImportUsecaseDb {
    constructor(
        private readonly matchesDb: IMatchesDbService,
        private readonly salesImportDb: ISalesImportDbService,
    ) {}

    getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]> {
        return this.matchesDb.getHomeMatchesForSeason(seasonStartYear);
    }

    bulkCreate(payload: {
        userId: UserId;
        batchId: string;
        sales: BulkSaleInput[];
    }): Promise<number> {
        return this.salesImportDb.bulkCreate(payload);
    }
}
