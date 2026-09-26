import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';
import { IAccountingDbService } from '../../../../db/accounting/accounting.db.interface';
import { MatchRealizedProfit } from '../../../../db/accounting/types/match-realized-profit.type';

export abstract class IGetAmortizationUsecaseDb {
    abstract findBySeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<SeasonPass[]>;
    abstract getRealizedProfitPerMatch(
        userId: UserId,
        from: Date,
        to: Date,
    ): Promise<MatchRealizedProfit[]>;
}

@Injectable()
export class GetAmortizationUsecaseDb implements IGetAmortizationUsecaseDb {
    constructor(
        private readonly seasonPassesDb: ISeasonPassesDbService,
        private readonly accountingDb: IAccountingDbService,
    ) {}

    findBySeason(userId: UserId, seasonStartYear: SeasonYear): Promise<SeasonPass[]> {
        return this.seasonPassesDb.findBySeason(userId, seasonStartYear);
    }

    getRealizedProfitPerMatch(
        userId: UserId,
        from: Date,
        to: Date,
    ): Promise<MatchRealizedProfit[]> {
        return this.accountingDb.getRealizedProfitPerMatch(userId, from, to);
    }
}
