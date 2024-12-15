import { Injectable } from '@nestjs/common';
import { Accounting } from './types/accounting.type';
import { AccountingService as AccountingDbService } from '../../db/accounting/accounting.service';
import { SalesService as SalesDbService } from '../../db/sales.service';
import { formatAggregate } from './accounting.utils';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { statusConverter } from './utils/status-converter.util';

@Injectable()
export class AccountingService {
    constructor(
        private readonly accountingDbService: AccountingDbService,
        private readonly salesDbService: SalesDbService,
    ) {}

    async getCurrentSeason(userId: string): Promise<TimePeriodAccounting> {
        const seasonDate = getCurrentSeasonDate();

        return this.getSeason(userId, seasonDate);
    }

    async getGivenSeason(
        userId: string,
        seasonStartYear: number,
    ): Promise<TimePeriodAccounting> {
        const dates = {
            start: new Date(seasonStartYear, 7, 1),
            end: new Date(seasonStartYear + 1, 6, 31),
        };

        return this.getSeason(userId, dates);
    }

    async getAllTime(userId: string): Promise<TimePeriodAccounting> {
        const oldestMatchSale = await this.salesDbService.getOldestMatchSale(userId);

        return this.getSeason(userId, {
            start: oldestMatchSale.Match.date,
        });
    }

    async getAccounting(
        userId: string,
        status: 'realized' | 'pending' | 'unrealized',
        date: {
            start: Date;
            end?: Date;
        },
    ): Promise<Accounting | null> {
        const aggregate = await this.accountingDbService.getAccounting(
            userId,
            statusConverter(status),
            date.start,
            date.end,
        );

        if (!aggregate) {
            return null;
        }

        const [lowestMatch, highestMatch] = await Promise.all([
            this.salesDbService.getOneByWithFullMatch({
                profit: aggregate._min.profit ?? undefined,
                status: statusConverter(status),
            }),
            this.salesDbService.getOneByWithFullMatch({
                profit: aggregate._max.profit ?? undefined,
                status: statusConverter(status),
            }),
        ]);

        return formatAggregate({
            sum: aggregate._sum,
            avg: aggregate._avg,
            min: {
                ...aggregate._min,
                match: {
                    ...lowestMatch.Match,
                    opponent: lowestMatch.Match.Opponent.name,
                },
            },
            max: {
                ...aggregate._max,
                match: {
                    ...highestMatch.Match,
                    opponent: highestMatch.Match.Opponent.name,
                },
            },
        });
    }

    async getSeason(
        userId: string,
        dates: {
            start: Date;
            end?: Date;
        },
    ): Promise<TimePeriodAccounting> {
        const [realizedAccounting, unrealizedAccounting, pendingAccounting] =
            await Promise.all([
                this.getAccounting(userId, 'realized', dates),
                this.getAccounting(userId, 'unrealized', dates),
                this.getAccounting(userId, 'pending', dates),
            ]);

        return {
            realized: realizedAccounting,
            unrealized: unrealizedAccounting,
            pending: pendingAccounting,
        };
    }
}
