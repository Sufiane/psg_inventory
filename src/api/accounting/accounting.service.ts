import { Injectable } from '@nestjs/common';
import { Accounting } from './types/accounting.type';
import {
    AccountingService as AccountingDbService,
} from '../../db/accounting/accounting.service';
import { SalesService as SalesDbService } from '../../db/sales.service';
import { formatAggregate } from './accounting.utils';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';

@Injectable()
export class AccountingService {
    constructor(
        private readonly accountingDbService: AccountingDbService,
        private readonly salesDbService: SalesDbService,
    ) {
    }

    async getCurrentSeason(userId: string): Promise<TimePeriodAccounting> {
        const seasonDate = getCurrentSeasonDate();

        const [realizedAccounting, unrealizedAccounting, pendingAccounting] =
            await Promise.all(
                [
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

    async getAllTime(
        userId: string,
        userCreationDate: Date,
    ): Promise<TimePeriodAccounting> {
        // todo start date can't be user creation if match have been sold in the past before creation
        // need to find the oldest sale created for the oldest match
        const [realizedAccounting, unrealizedAccounting, pendingAccounting] =
            await Promise.all(
                [
                    this.getAccounting(userId, 'realized', { start: userCreationDate }),
                    this.getAccounting(userId, 'unrealized', { start: userCreationDate }),
                    this.getAccounting(userId, 'pending', { start: userCreationDate }),
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
            start: Date,
            end?: Date,
        },
    ): Promise<Accounting | null> {
        const aggregate = await this.accountingDbService.getAccounting(
            userId,
            status,
            date.start,
            date.end,
        );


        if (!aggregate) {
            return null;
        }

        const [lowestMatch, highestMatch] = await Promise.all([
            this.salesDbService.getOneByWithFullMatch(
                { profit: aggregate._min.profit ?? undefined }),
            this.salesDbService.getOneByWithFullMatch(
                { profit: aggregate._max.profit ?? undefined }),
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
