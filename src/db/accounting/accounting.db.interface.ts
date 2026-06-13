import { SaleStatus } from '@prisma/client';
import type { UserId } from '@psg/shared';
import { AccountingAggregate } from './types/get-accounting.type';
import { MatchRealizedProfit } from './types/match-realized-profit.type';
import { SoldLeadTime } from './types/sold-lead-time.type';

export abstract class IAccountingDbService {
    abstract getAccounting(
        userId: UserId,
        status: SaleStatus,
        from: Date,
        to?: Date,
    ): Promise<AccountingAggregate | null>;

    abstract getRealizedProfitPerMatch(
        userId: UserId,
        from: Date,
        to: Date,
    ): Promise<MatchRealizedProfit[]>;

    abstract getSoldLeadTimes(
        userId: UserId,
        from: Date,
        to?: Date,
    ): Promise<SoldLeadTime[]>;
}
