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
import { Amortization, AmortizationMatchRow } from './types/amortization.type';
import { LeadTime } from './types/lead-time.type';
import { SoldLeadTime } from '../../db/accounting/types/sold-lead-time.type';

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
                    seasonInvestments: [],
                    totalSeasonInvestment: 0,
                    leadTime: null,
                }
            );
        }

        const [
            realizedAccounting,
            unrealizedAccounting,
            pendingAccounting,
            seasonPasses,
            allPasses,
            leadTimes,
        ] = await Promise.all([
            this.getAccounting(userId, 'realized', dates),
            this.getAccounting(userId, 'unrealized', dates),
            this.getAccounting(userId, 'pending', dates),
            seasonStartYear !== null
                ? this.seasonPassesDbService.findBySeason(userId, seasonStartYear)
                : Promise.resolve([]),
            seasonStartYear === null
                ? this.seasonPassesDbService.findAll(userId)
                : Promise.resolve([]),
            this.accountingDbService.getSoldLeadTimes(userId, dates.start, dates.end),
        ]);

        const seasonInvestments: SeasonInvestment[] = seasonPasses.map((pass) => ({
            id: pass.id,
            price: pass.price,
            seasonStartYear: pass.seasonStartYear,
            label: pass.label,
            category: pass.category,
            row: pass.row,
            seat: pass.seat,
        }));

        // For the all-time view, only count passes for seasons that have already
        // started — a future season's pass is paid but not yet "in use", so
        // including it would understate the historical net.
        const currentSeasonStartYear = seasonStartYearFromDate(new Date());
        const totalSeasonInvestment =
            seasonStartYear === null
                ? allPasses
                      .filter((pass) => pass.seasonStartYear <= currentSeasonStartYear)
                      .reduce((sum, pass) => sum + pass.price, 0)
                : seasonInvestments.reduce((sum, pass) => sum + pass.price, 0);

        const accounting: TimePeriodAccounting = {
            realized: realizedAccounting,
            unrealized: unrealizedAccounting,
            pending: pendingAccounting,
            seasonInvestments,
            totalSeasonInvestment,
            leadTime: computeLeadTime(leadTimes),
        };

        await this.redisService.set(cacheKey, accounting, ONE_DAY_TTL);

        return accounting;
    }

    async getAmortization(
        userId: string,
        seasonStartYear: number,
    ): Promise<Amortization> {
        const cacheKey = CACHE_KEYS.amortization(userId, seasonStartYear);
        const cached = await this.redisService.get<Amortization>(cacheKey);

        if (cached !== null) {
            return cached.value ?? emptyAmortization(seasonStartYear);
        }

        const dates = {
            start: new Date(seasonStartYear, 7, 1),
            end: new Date(seasonStartYear + 1, 6, 31),
        };

        const [passes, matchRows] = await Promise.all([
            this.seasonPassesDbService.findBySeason(userId, seasonStartYear),
            this.accountingDbService.getRealizedProfitPerMatch(
                userId,
                dates.start,
                dates.end,
            ),
        ]);

        const hasPass = passes.length > 0;
        const passPrice = passes.reduce((sum, pass) => sum + pass.price, 0);
        const passSummaries = passes.map((pass) => ({
            id: pass.id,
            label: pass.label,
            price: pass.price,
        }));

        let cumulative = 0;
        let breakEvenAssigned = false;

        const perMatch: AmortizationMatchRow[] = matchRows.map((row) => {
            cumulative += row.matchProfit;

            const isBreakEven =
                !breakEvenAssigned && hasPass && passPrice > 0 && cumulative >= passPrice;

            if (isBreakEven) {
                breakEvenAssigned = true;
            }

            return {
                matchId: row.matchId,
                date: row.date,
                opponent: row.opponent,
                competition: row.competition,
                atHome: row.atHome,
                matchProfit: row.matchProfit,
                cumulative,
                isBreakEven,
            };
        });

        const totalRealized = cumulative;
        const breakEvenRow = perMatch.find((row) => row.isBreakEven) ?? null;

        const result: Amortization = {
            seasonStartYear,
            passPrice,
            hasPass,
            totalRealized,
            progress:
                hasPass && passPrice > 0 ? Math.min(1, totalRealized / passPrice) : 0,
            remaining:
                hasPass && passPrice > 0 ? Math.max(0, passPrice - totalRealized) : 0,
            surplus:
                hasPass && passPrice > 0
                    ? Math.max(0, totalRealized - passPrice)
                    : Math.max(0, totalRealized),
            breakEven: breakEvenRow
                ? {
                      matchId: breakEvenRow.matchId,
                      date: breakEvenRow.date,
                      opponent: breakEvenRow.opponent,
                      cumulative: breakEvenRow.cumulative,
                  }
                : null,
            perMatch,
            passes: passSummaries,
        };

        await this.redisService.set(cacheKey, result, ONE_DAY_TTL);

        return result;
    }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function leadDays(soldAt: Date, matchDate: Date): number {
    // Sale-after-kickoff is rejected at the api layer, so this is always ≥ 0;
    // clamp defensively against legacy/backfilled rows.
    return Math.max(0, Math.floor((matchDate.getTime() - soldAt.getTime()) / MS_PER_DAY));
}

function computeLeadTime(rows: SoldLeadTime[]): LeadTime | null {
    if (rows.length === 0) {
        return null;
    }

    const days = rows.map((row) => leadDays(row.soldAt, row.matchDate));
    const sorted = [...days].sort((firstDay, secondDay) => firstDay - secondDay);
    const sum = days.reduce((acc, day) => acc + day, 0);
    const mid = Math.floor(sorted.length / 2);
    const median =
        sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    return {
        soldCount: rows.length,
        avgLeadDays: Math.round((sum / rows.length) * 10) / 10,
        medianLeadDays: Math.round(median * 10) / 10,
        minLeadDays: sorted[0],
        maxLeadDays: sorted[sorted.length - 1],
    };
}

function emptyAmortization(seasonStartYear: number): Amortization {
    return {
        seasonStartYear,
        passPrice: 0,
        hasPass: false,
        totalRealized: 0,
        progress: 0,
        remaining: 0,
        surplus: 0,
        breakEven: null,
        perMatch: [],
        passes: [],
    };
}
