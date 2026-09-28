import type { CacheKey, CacheKeyPattern } from '@psg/shared/cache';
import type { MatchId, SaleId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Email } from '@psg/shared/strings';
import type { SeasonYear } from '@psg/shared/time';
import type { Users } from '@prisma/client';
import type { Amortization } from '../api/accounting/types/amortization.type';
import type { TimePeriodAccounting } from '../api/accounting/types/time-period-accounting.type';
import type { Match } from '../db/matches/types/match.type';
import type { RecipientWithGiftCount } from '../db/recipients/type/recipient.type';
import type { Sale } from '../db/sales/type/sale.type';
import type { SeasonPass } from '../db/season-passes/type/season-pass.type';

export default {
    accounting: (
        userId: UserId,
        start: Date,
        end?: Date,
    ): CacheKey<TimePeriodAccounting> =>
        `accounting:user:id:${userId}:start:${start.toISOString()}:end:${end?.toISOString()}` as CacheKey<TimePeriodAccounting>,
    amortization: (userId: UserId, seasonStartYear: SeasonYear): CacheKey<Amortization> =>
        `accounting:user:id:${userId}:amortization:${seasonStartYear}` as CacheKey<Amortization>,
    askRateLimit: (userId: UserId, hourBucket: string): CacheKey<number> =>
        `ask:user:id:${userId}:hour:${hourBucket}` as CacheKey<number>,
    invalidateAccounting: (userId: UserId): CacheKeyPattern =>
        `accounting:user:id:${userId}:*` as CacheKeyPattern,
    // Cache keys are built from the query *window* start (a season boundary),
    // never from a match's own kickoff, so there is no correct narrower
    // pattern to offer. createMatch and loadMatches both flush the namespace.
    invalidateMatches: (): CacheKeyPattern => 'matches:*' as CacheKeyPattern,
    match: (matchId: MatchId, withResult: boolean = false): CacheKey<Match> =>
        `match:id:${matchId}:${withResult}` as CacheKey<Match>,
    matches: (from: Date, to?: Date, withResult: boolean = false): CacheKey<Match[]> =>
        `matches:start:${from.toISOString()}:end:${to?.toISOString()}:withResult:${withResult}` as CacheKey<
            Match[]
        >,
    sale: (saleId: SaleId): CacheKey<Sale> => `sale:id:${saleId}` as CacheKey<Sale>,
    sales: (userId: UserId): CacheKey<Sale[]> =>
        `user:id:${userId}:sales` as CacheKey<Sale[]>,
    salesByMatch: (userId: UserId, matchId: MatchId): CacheKey<Sale[]> =>
        `user:id:${userId}:sales:match:${matchId}` as CacheKey<Sale[]>,
    salesByRange: (userId: UserId, from: Date, to: Date): CacheKey<Sale[]> =>
        `user:id:${userId}:sales:start:${from.toISOString()}:end:${to.toISOString()}` as CacheKey<
            Sale[]
        >,
    invalidateSales: (userId: UserId): CacheKeyPattern =>
        `user:id:${userId}:sales*` as CacheKeyPattern,
    userByEmail: (email: Email): CacheKey<Users> =>
        `user:email:${email}` as CacheKey<Users>,
    refreshToken: (familyId: string, secret: string): CacheKey<string> =>
        `auth:refresh:${familyId}:${secret}` as CacheKey<string>,
    invalidateRefreshFamily: (familyId: string): CacheKeyPattern =>
        `auth:refresh:${familyId}:*` as CacheKeyPattern,
    seasonPass: (id: SeasonPassId): CacheKey<SeasonPass> =>
        `season-pass:id:${id}` as CacheKey<SeasonPass>,
    seasonPassesBySeason: (
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): CacheKey<SeasonPass[]> =>
        `user:id:${userId}:season-passes:season:${seasonStartYear}` as CacheKey<
            SeasonPass[]
        >,
    seasonPasses: (userId: UserId): CacheKey<SeasonPass[]> =>
        `user:id:${userId}:season-passes` as CacheKey<SeasonPass[]>,
    invalidateSeasonPasses: (userId: UserId): CacheKeyPattern =>
        `user:id:${userId}:season-pass*` as CacheKeyPattern,
    invalidateSeasonPassById: (id: SeasonPassId): CacheKeyPattern =>
        `season-pass:id:${id}*` as CacheKeyPattern,
    recipients: (userId: UserId): CacheKey<RecipientWithGiftCount[]> =>
        `user:id:${userId}:recipients` as CacheKey<RecipientWithGiftCount[]>,
    invalidateRecipients: (userId: UserId): CacheKeyPattern =>
        `user:id:${userId}:recipients*` as CacheKeyPattern,
};
