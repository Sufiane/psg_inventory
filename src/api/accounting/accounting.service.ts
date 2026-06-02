import { Injectable } from '@nestjs/common';
import { Accounting } from './types/accounting.type';
import { IAccountingDbService } from '../../db/accounting/accounting.db.interface';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import { formatAggregate } from './utils/format-aggregate.util';
import {
    SeasonInvestment,
    TimePeriodAccounting,
} from './types/time-period-accounting.type';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { statusConverter } from './utils/status-converter.util';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { ONE_DAY_TTL } from '../../shared/constants';
import { IAccountingService } from './interfaces/accounting.service.interface';

function seasonStartYearFromDate(date: Date): number {
    return date.getMonth() < 7 ? date.getFullYear() - 1 : date.getFullYear();
}

@Injectable()
export class AccountingService implements IAccountingService {
    constructor(
        private readonly accountingDbService: IAccountingDbService,
        private readonly salesDbService: ISalesDbService,
        private readonly seasonPassesDbService: ISeasonPassesDbService,
        private readonly redisService: RedisService,
    ) {}

    async getCurrentSeason(userId: string): Promise<TimePeriodAccounting> {
        const seasonDate = getCurrentSeasonDate();
        const year = seasonStartYearFromDate(seasonDate.start);

        return this.getSeason(userId, seasonDate, year);
    }

    async getGivenSeason(
        userId: string,
        seasonStartYear: number,
    ): Promise<TimePeriodAccounting> {
        const dates = {
            start: new Date(seasonStartYear, 7, 1),
            end: new Date(seasonStartYear + 1, 6, 31),
        };

        return this.getSeason(userId, dates, seasonStartYear);
    }

    async getAllTime(userId: string): Promise<TimePeriodAccounting> {
        const oldestMatchSale = await this.salesDbService.getOldestMatchSale(userId);

        return this.getSeason(
            userId,
            {
                start: oldestMatchSale.Match.date,
            },
            null,
        );
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
        seasonStartYear: number | null,
    ): Promise<TimePeriodAccounting> {
        const cacheKey = CACHE_KEYS.accounting(userId, dates.start, dates.end);
        const cached = await this.redisService.get<TimePeriodAccounting>(cacheKey);

        if (cached !== null) {
            return (
                cached.value ?? {
                    realized: null,
                    pending: null,
                    unrealized: null,
                    seasonInvestment: null,
                    totalSeasonInvestment: 0,
                }
            );
        }

        const [
            realizedAccounting,
            unrealizedAccounting,
            pendingAccounting,
            seasonInvestment,
            allPasses,
        ] = await Promise.all([
            this.getAccounting(userId, 'realized', dates),
            this.getAccounting(userId, 'unrealized', dates),
            this.getAccounting(userId, 'pending', dates),
            seasonStartYear !== null
                ? this.seasonPassesDbService.findBySeason(userId, seasonStartYear)
                : Promise.resolve(null),
            seasonStartYear === null
                ? this.seasonPassesDbService.findAll(userId)
                : Promise.resolve([]),
        ]);

        const seasonInvestmentInfo: SeasonInvestment | null = seasonInvestment
            ? {
                  price: seasonInvestment.price,
                  seasonStartYear: seasonInvestment.seasonStartYear,
                  category: seasonInvestment.category,
                  row: seasonInvestment.row,
                  seat: seasonInvestment.seat,
              }
            : null;

        // For the all-time view, only count passes for seasons that have already
        // started — a future season's pass is paid but not yet "in use", so
        // including it would understate the historical net.
        const currentSeasonStartYear = seasonStartYearFromDate(new Date());
        const totalSeasonInvestment =
            seasonStartYear === null
                ? allPasses
                      .filter((pass) => pass.seasonStartYear <= currentSeasonStartYear)
                      .reduce((sum, pass) => sum + pass.price, 0)
                : (seasonInvestmentInfo?.price ?? 0);

        const accounting: TimePeriodAccounting = {
            realized: realizedAccounting,
            unrealized: unrealizedAccounting,
            pending: pendingAccounting,
            seasonInvestment: seasonInvestmentInfo,
            totalSeasonInvestment,
        };

        await this.redisService.set(cacheKey, accounting, ONE_DAY_TTL);

        return accounting;
    }
}
