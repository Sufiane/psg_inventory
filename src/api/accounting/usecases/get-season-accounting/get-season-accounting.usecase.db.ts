import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';
import type { Profit } from '@psg/shared/money';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { IAccountingDbService } from '../../../../db/accounting/accounting.db.interface';
import { AccountingAggregate } from '../../../../db/accounting/types/get-accounting.type';
import { SoldLeadTime } from '../../../../db/accounting/types/sold-lead-time.type';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { SaleWithFullMatch } from '../../../../db/sales/type/sale-with-full-match.type';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';

export type SaleExtremeQuery = {
    profit?: Profit;
    statuses?: SaleStatus[];
    userId: UserId;
    matchDateFrom: Date;
    matchDateTo?: Date;
};

// This usecase's entire db surface (PSG-28): exactly the accounting/sales/
// season-passes queries getSeason runs. It wraps the existing db tokens and
// never talks to Prisma directly — AccountingDb/SalesDb/SeasonPassesDb stay
// the single implementations of these queries, nothing is duplicated here.
export abstract class IGetSeasonAccountingUsecaseDb {
    abstract getAccounting(
        userId: UserId,
        statuses: SaleStatus[],
        from: Date,
        to?: Date,
    ): Promise<AccountingAggregate | null>;
    abstract getSoldLeadTimes(
        userId: UserId,
        from: Date,
        to?: Date,
    ): Promise<SoldLeadTime[]>;
    abstract getOneByWithFullMatch(query: SaleExtremeQuery): Promise<SaleWithFullMatch>;
    abstract findBySeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<SeasonPass[]>;
    abstract findAll(userId: UserId): Promise<SeasonPass[]>;
}

@Injectable()
export class GetSeasonAccountingUsecaseDb implements IGetSeasonAccountingUsecaseDb {
    constructor(
        private readonly accountingDb: IAccountingDbService,
        private readonly salesDb: ISalesDbService,
        private readonly seasonPassesDb: ISeasonPassesDbService,
    ) {}

    getAccounting(
        userId: UserId,
        statuses: SaleStatus[],
        from: Date,
        to?: Date,
    ): Promise<AccountingAggregate | null> {
        return this.accountingDb.getAccounting(userId, statuses, from, to);
    }

    getSoldLeadTimes(userId: UserId, from: Date, to?: Date): Promise<SoldLeadTime[]> {
        return this.accountingDb.getSoldLeadTimes(userId, from, to);
    }

    getOneByWithFullMatch(query: SaleExtremeQuery): Promise<SaleWithFullMatch> {
        return this.salesDb.getOneByWithFullMatch(query);
    }

    findBySeason(userId: UserId, seasonStartYear: SeasonYear): Promise<SeasonPass[]> {
        return this.seasonPassesDb.findBySeason(userId, seasonStartYear);
    }

    findAll(userId: UserId): Promise<SeasonPass[]> {
        return this.seasonPassesDb.findAll(userId);
    }
}
