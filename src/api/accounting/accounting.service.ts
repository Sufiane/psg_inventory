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

        const [realizedAccounting, unrealizedAccounting, pendingAccounting] =
            await Promise.all([
                this.getAccounting(userId, 'realized', seasonDate),
                this.getAccounting(userId, 'unrealized', seasonDate),
                this.getAccounting(userId, 'pending', seasonDate),
            ]);

        return {
            realized: realizedAccounting,
            unrealized: unrealizedAccounting,
            pending: pendingAccounting,
        };
    }

    async getAllTime(userId: string): Promise<TimePeriodAccounting> {
        const oldestMatchSale = await this.salesDbService.getOldestMatchSale(userId);

        const date = { start: oldestMatchSale.Match.date };

        const [realizedAccounting, unrealizedAccounting, pendingAccounting] =
            await Promise.all([
                this.getAccounting(userId, 'realized', date),
                this.getAccounting(userId, 'unrealized', date),
                this.getAccounting(userId, 'pending', date),
            ]);

        return {
            realized: realizedAccounting,
            unrealized: unrealizedAccounting,
            pending: pendingAccounting,
        };
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
}
