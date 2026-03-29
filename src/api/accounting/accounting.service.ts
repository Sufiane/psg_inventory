import { Injectable } from '@nestjs/common';
import { Accounting } from './types/accounting.type';
import { IAccountingDbService } from '../../db/accounting/accounting.db.interface';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { formatAggregate } from './utils/format-aggregate.util';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { statusConverter } from './utils/status-converter.util';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { ONE_DAY_TTL } from '../../shared/constants';
import { IAccountingService } from './interfaces/accounting.service.interface';

@Injectable()
export class AccountingService implements IAccountingService {
    constructor(
        private readonly accountingDbService: IAccountingDbService,
        private readonly salesDbService: ISalesDbService,
        private readonly redisService: RedisService,
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
                profit: aggregate._min.profit,
                status: statusConverter(status),
            }),
            this.salesDbService.getOneByWithFullMatch({
                profit: aggregate._max.profit,
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
        const cacheKey = CACHE_KEYS.accounting(userId, dates.start, dates.end);
        const cached = await this.redisService.get<TimePeriodAccounting>(cacheKey);

        if (cached !== null) {
            return cached.value;
        }

        const [realizedAccounting, unrealizedAccounting, pendingAccounting] =
            await Promise.all([
                this.getAccounting(userId, 'realized', dates),
                this.getAccounting(userId, 'unrealized', dates),
                this.getAccounting(userId, 'pending', dates),
            ]);

        const accounting = {
            realized: realizedAccounting,
            unrealized: unrealizedAccounting,
            pending: pendingAccounting,
        };

        await this.redisService.set(cacheKey, accounting, ONE_DAY_TTL);

        return accounting;
    }
}
