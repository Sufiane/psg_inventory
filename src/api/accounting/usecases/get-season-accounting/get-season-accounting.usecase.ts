import { Injectable } from '@nestjs/common';
import type { SoldCount } from '@psg/shared/counts';
import type { UserId } from '@psg/shared/ids';
import type { LeadDays, SeasonYear } from '@psg/shared/time';
import { Accounting } from '../../types/accounting.type';
import type { AccountingStatus } from '../../types/accounting-status.type';
import {
    SeasonInvestment,
    TimePeriodAccounting,
} from '../../types/time-period-accounting.type';
import { LeadTime } from '../../types/lead-time.type';
import { formatAggregate } from '../../utils/format-aggregate.util';
import { statusConverter } from '../../utils/status-converter.util';
import { seasonStartYearFromDate } from '../../../../shared/utils/season.utils';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { ONE_DAY_TTL } from '../../../../shared/constants';
import { SoldLeadTime } from '../../../../db/accounting/types/sold-lead-time.type';
import { IGetSeasonAccountingUsecaseDb } from './get-season-accounting.usecase.db';

export abstract class IGetSeasonAccountingUsecase {
    abstract execute(
        userId: UserId,
        dates: { start: Date; end?: Date },
        seasonStartYear: SeasonYear | null,
    ): Promise<TimePeriodAccounting>;
}

// The season half of the accounting module (PSG-28): parallel-fetches the
// four accounting buckets, season-pass data, and lead times; applies the
// season-investment cutoff rule; computes lead-time stats; redis-cached.
// Extracted from AccountingService.getSeason — byte-identical logic.
@Injectable()
export class GetSeasonAccountingUsecase implements IGetSeasonAccountingUsecase {
    constructor(
        private readonly db: IGetSeasonAccountingUsecaseDb,
        private readonly redisService: RedisService,
    ) {}

    async execute(
        userId: UserId,
        dates: { start: Date; end?: Date },
        seasonStartYear: SeasonYear | null,
    ): Promise<TimePeriodAccounting> {
        const accounting = await this.redisService.get(
            CACHE_KEYS.accounting(userId, dates.start, dates.end),
            ONE_DAY_TTL,
            async () => {
                const [
                    realizedAccounting,
                    unrealizedAccounting,
                    pendingAccounting,
                    giftedAccounting,
                    seasonPasses,
                    allPasses,
                    leadTimes,
                ] = await Promise.all([
                    this.getAccounting(userId, 'realized', dates),
                    this.getAccounting(userId, 'unrealized', dates),
                    this.getAccounting(userId, 'pending', dates),
                    this.getAccounting(userId, 'gifted', dates),
                    seasonStartYear !== null
                        ? this.db.findBySeason(userId, seasonStartYear)
                        : Promise.resolve([]),
                    seasonStartYear === null
                        ? this.db.findAll(userId)
                        : Promise.resolve([]),
                    this.db.getSoldLeadTimes(userId, dates.start, dates.end),
                ]);

                const seasonInvestments: SeasonInvestment[] = seasonPasses.map(
                    (pass) => ({
                        id: pass.id,
                        price: pass.price,
                        seasonStartYear: pass.seasonStartYear,
                        label: pass.label,
                        category: pass.category,
                        row: pass.row,
                        seat: pass.seat,
                    }),
                );

                // For the all-time view, only count passes for seasons that
                // have already started — a future season's pass is paid but
                // not yet "in use", so including it would understate the
                // historical net.
                const currentSeasonStartYear = seasonStartYearFromDate(new Date());
                const totalSeasonInvestment =
                    seasonStartYear === null
                        ? allPasses
                              .filter(
                                  (pass) =>
                                      pass.seasonStartYear <= currentSeasonStartYear,
                              )
                              .reduce((sum, pass) => sum + pass.price, 0)
                        : seasonInvestments.reduce((sum, pass) => sum + pass.price, 0);

                const result: TimePeriodAccounting = {
                    realized: realizedAccounting,
                    unrealized: unrealizedAccounting,
                    pending: pendingAccounting,
                    gifted: giftedAccounting,
                    seasonInvestments,
                    totalSeasonInvestment,
                    leadTime: computeLeadTime(leadTimes),
                };

                return result;
            },
        );

        return (
            accounting ?? {
                realized: null,
                pending: null,
                unrealized: null,
                gifted: null,
                seasonInvestments: [],
                totalSeasonInvestment: 0,
                leadTime: null,
            }
        );
    }

    private async getAccounting(
        userId: UserId,
        status: AccountingStatus,
        date: {
            start: Date;
            end?: Date;
        },
    ): Promise<Accounting | null> {
        const aggregate = await this.db.getAccounting(
            userId,
            statusConverter(status),
            date.start,
            date.end,
        );

        if (!aggregate) {
            return null;
        }

        const scope = {
            statuses: statusConverter(status),
            userId,
            matchDateFrom: date.start,
            ...(date.end ? { matchDateTo: date.end } : {}),
        };

        const [lowestMatch, highestMatch] = await Promise.all([
            this.db.getOneByWithFullMatch({
                profit: aggregate._min.profit,
                ...scope,
            }),
            this.db.getOneByWithFullMatch({
                profit: aggregate._max.profit,
                ...scope,
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

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function leadDays(soldAt: Date, matchDate: Date): LeadDays {
    // Sale-after-kickoff is rejected at the api layer, so this is always ≥ 0;
    // clamp defensively against legacy/backfilled rows.
    return Math.max(
        0,
        Math.floor((matchDate.getTime() - soldAt.getTime()) / MS_PER_DAY),
    ) as LeadDays;
}

function computeLeadTime(rows: SoldLeadTime[]): LeadTime | null {
    if (rows.length === 0) {
        return null;
    }

    const days = rows.map((row) => leadDays(row.soldAt, row.matchDate));
    const sorted = [...days].sort((firstDay, secondDay) => firstDay - secondDay);
    const sum = days.reduce((acc, day) => acc + day, 0);
    const mid = Math.floor(sorted.length / 2);
    // rows.length > 0 (checked above) guarantees sorted/days are non-empty,
    // so every index below is in bounds.
    const median =
        sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;

    return {
        soldCount: rows.length as SoldCount,
        avgLeadDays: (Math.round((sum / rows.length) * 10) / 10) as LeadDays,
        medianLeadDays: (Math.round(median * 10) / 10) as LeadDays,
        minLeadDays: sorted[0]!,
        maxLeadDays: sorted[sorted.length - 1]!,
    };
}
