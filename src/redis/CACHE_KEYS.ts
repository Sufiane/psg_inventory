import type { CacheKey, CacheKeyPattern } from '@psg/shared/cache';
import { Users } from '@prisma/client';
import { Amortization } from '../api/accounting/types/amortization.type';
import { TimePeriodAccounting } from '../api/accounting/types/time-period-accounting.type';
import { Match } from '../db/matches/types/match.type';
import { Sale } from '../db/sales/type/sale.type';
import { SeasonPass } from '../db/season-passes/type/season-pass.type';

export default {
    accounting: (
        userId: string,
        start: Date,
        end?: Date,
    ): CacheKey<TimePeriodAccounting> =>
        `accounting:user:id:${userId}:start:${start.toISOString()}:end:${end?.toISOString()}` as CacheKey<TimePeriodAccounting>,
    amortization: (userId: string, seasonStartYear: number): CacheKey<Amortization> =>
        `accounting:user:id:${userId}:amortization:${seasonStartYear}` as CacheKey<Amortization>,
    invalidateAccounting: (userId: string): CacheKeyPattern =>
        `accounting:user:id:${userId}:*` as CacheKeyPattern,
    invalidateMatches: (from?: Date): CacheKeyPattern =>
        (from ? `matches:start:${from.toISOString()}:*` : 'matches:*') as CacheKeyPattern,
    match: (matchId: string): CacheKey<Match> => `match:id:${matchId}` as CacheKey<Match>,
    matches: (from: Date, to?: Date, withResult: boolean = false): CacheKey<Match[]> =>
        `matches:start:${from.toISOString()}:end:${to?.toISOString()}:withResult:${withResult}` as CacheKey<
            Match[]
        >,
    sale: (saleId: string): CacheKey<Sale> => `sale:id:${saleId}` as CacheKey<Sale>,
    sales: (userId: string): CacheKey<Sale[]> =>
        `user:id:${userId}:sales` as CacheKey<Sale[]>,
    salesByRange: (userId: string, from: Date, to: Date): CacheKey<Sale[]> =>
        `user:id:${userId}:sales:start:${from.toISOString()}:end:${to.toISOString()}` as CacheKey<
            Sale[]
        >,
    invalidateSales: (userId: string): CacheKeyPattern =>
        `user:id:${userId}:sales*` as CacheKeyPattern,
    userByEmail: (email: string): CacheKey<Users> =>
        `user:email:${email}` as CacheKey<Users>,
    seasonPass: (id: string): CacheKey<SeasonPass> =>
        `season-pass:id:${id}` as CacheKey<SeasonPass>,
    seasonPassesBySeason: (
        userId: string,
        seasonStartYear: number,
    ): CacheKey<SeasonPass[]> =>
        `user:id:${userId}:season-passes:season:${seasonStartYear}` as CacheKey<
            SeasonPass[]
        >,
    seasonPasses: (userId: string): CacheKey<SeasonPass[]> =>
        `user:id:${userId}:season-passes` as CacheKey<SeasonPass[]>,
    invalidateSeasonPasses: (userId: string): CacheKeyPattern =>
        `user:id:${userId}:season-pass*` as CacheKeyPattern,
    invalidateSeasonPassById: (id: string): CacheKeyPattern =>
        `season-pass:id:${id}*` as CacheKeyPattern,
};
