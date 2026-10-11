import { PrismaService } from '../prisma.service';
import { FormattedMatch } from '../../shared/types/formatted-match.type';
import { convertStringToCompetition } from './matches.utils';
import { Competition } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import type { MatchId, UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { matchQuery } from './matches.query';
import { Match } from './types/match.type';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { getSeasonWindow } from '../../shared/utils/season.utils';
import { IMatchesDbService, LoadMatchesResult } from './matches.db.interface';

// syncMatches mutates this rather than returning values, because if a
// mid-loop transaction throws, its return value never runs — this is the only
// way the `finally` in loadMatches still sees what earlier iterations did.
interface SyncProgress {
    updatedMatchIds: MatchId[];
    dateChangedMatchIds: MatchId[];
    unknownCompetitions: string[];
}

@Injectable()
export class MatchesDb implements IMatchesDbService {
    private readonly logger = new Logger(MatchesDb.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async getMatches(
        dates: { from: Date; to?: Date },
        withResult: boolean = false,
    ): Promise<Match[]> {
        const where: { date: { gte: Date; lt?: Date } } = {
            date: {
                gte: dates.from,
            },
        };

        if (dates.to) {
            where.date.lt = dates.to;
        }

        const result = await this.redisService.get(
            CACHE_KEYS.matches(dates.from, dates.to, withResult),
            ONE_HOUR_TTL,
            () =>
                this.prisma.matches.findMany({
                    ...matchQuery(withResult),
                    where: where,
                    orderBy: { date: 'asc' },
                }) as Promise<Match[]>,
        );

        // if by mistake there is a null value in cache
        return result ?? [];
    }

    async getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]> {
        const { start: from, end: to } = getSeasonWindow(seasonStartYear, 'exclusive');

        return this.prisma.matches.findMany({
            ...matchQuery(false),
            where: {
                atHome: true,
                date: { gte: from, lt: to },
            },
            orderBy: { date: 'asc' },
        }) as Promise<Match[]>;
    }

    async getOneMatch(id: MatchId, withResult: boolean = false): Promise<Match | null> {
        return this.redisService.get(
            CACHE_KEYS.match(id, withResult),
            ONE_HOUR_TTL,
            () =>
                this.prisma.matches.findUnique({
                    ...matchQuery(withResult),
                    where: {
                        id,
                    },
                }) as Promise<Match | null>,
        );
    }

    async loadMatches(matches: FormattedMatch[]): Promise<LoadMatchesResult> {
        const progress: SyncProgress = {
            updatedMatchIds: [],
            dateChangedMatchIds: [],
            unknownCompetitions: [],
        };

        let syncFailed = false;

        try {
            await this.syncMatches(matches, progress);
        } catch (error) {
            syncFailed = true;

            throw error;
        } finally {
            // Runs even if a mid-loop transaction throws, so matches
            // committed by earlier iterations never serve stale cache data
            // for the rest of the TTL.
            const failures = await this.runCleanup(progress);

            this.reportCleanupFailures(failures, syncFailed);
        }

        return { unknownCompetitions: [...new Set(progress.unknownCompetitions)] };
    }

    private async runCleanup(progress: SyncProgress): Promise<unknown[]> {
        const steps: Promise<unknown>[] = [
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateMatches()),
            this.invalidateSalesCachesForMatches(progress.dateChangedMatchIds),
        ];

        for (const matchId of progress.updatedMatchIds) {
            // Direct deletes of the 2 known key shapes instead of a
            // pattern scan per match id — invalidatePattern's MATCH
            // option only filters what SCAN returns, it still walks the
            // entire keyspace, so N updated matches used to mean N
            // full-keyspace scans.
            steps.push(
                this.redisService.invalidate(CACHE_KEYS.match(matchId, true)),
                this.redisService.invalidate(CACHE_KEYS.match(matchId, false)),
            );
        }

        const results = await Promise.allSettled(steps);
        const failures: unknown[] = [];

        for (const result of results) {
            if (result.status === 'rejected') {
                failures.push(result.reason);
            }
        }

        return failures;
    }

    // Runs inside a finally: throwing while the sync error is propagating
    // would replace it, so only rethrow if sync succeeded.
    private reportCleanupFailures(failures: unknown[], syncFailed: boolean): void {
        for (const failure of failures) {
            // Log every failure, not just the rethrown one: the others are
            // otherwise lost, and when the sync failed none are rethrown.
            this.logger.error('cache cleanup step failed', failure);
        }

        if (syncFailed || failures.length === 0) {
            return;
        }

        throw failures[0];
    }

    private async invalidateSalesCachesForMatches(matchIds: MatchId[]): Promise<void> {
        if (matchIds.length === 0) {
            return;
        }

        const owners = await this.prisma.sales.findMany({
            where: { matchId: { in: matchIds } },
            select: { userId: true },
            distinct: ['userId'],
        });

        await Promise.all(
            owners.flatMap((owner) => {
                const userId = owner.userId as UserId;

                return [
                    this.redisService.invalidatePattern(
                        CACHE_KEYS.invalidateSales(userId),
                    ),
                    this.redisService.invalidatePattern(
                        CACHE_KEYS.invalidateAccounting(userId),
                    ),
                ];
            }),
        );
    }

    private async syncMatches(
        matches: FormattedMatch[],
        progress: SyncProgress,
    ): Promise<void> {
        for (const match of matches) {
            const competition = convertStringToCompetition(match.competition);

            if (competition === null) {
                progress.unknownCompetitions.push(match.competition);

                continue;
            }

            await this.prisma.$transaction(async (tx) => {
                const { id: opponentId } = await tx.opponents.upsert({
                    select: {
                        id: true,
                    },
                    update: {},
                    create: {
                        name: match.opponent,
                    },
                    where: {
                        name: match.opponent,
                    },
                });

                const matchDate = new Date(match.date);
                const dayStart = new Date(matchDate);

                dayStart.setUTCHours(0, 0, 0, 0);

                const dayEnd = new Date(matchDate);

                dayEnd.setUTCHours(23, 59, 59, 999);

                // Dedupe by (opponentId, calendar day) rather than exact timestamp.
                // football-data revises kickoff times as fixtures get confirmed
                // (TBD placeholder -> real kickoff); without this, every revision
                // creates a duplicate row.
                const existing = await tx.matches.findFirst({
                    select: { id: true, date: true },
                    where: {
                        opponentId,
                        date: { gte: dayStart, lte: dayEnd },
                    },
                });

                const resultData = match.result
                    ? {
                          isWin: match.result.isWin,
                          score: match.result.score,
                      }
                    : null;

                if (existing) {
                    await tx.matches.update({
                        where: { id: existing.id },
                        data: {
                            date: matchDate,
                            competition,
                            atHome: match.atHome,
                            ...(resultData
                                ? {
                                      MatchResults: {
                                          upsert: {
                                              create: resultData,
                                              update: resultData,
                                          },
                                      },
                                  }
                                : {}),
                        },
                    });

                    progress.updatedMatchIds.push(existing.id as MatchId);

                    // Date-only on purpose: competition/atHome edits don't flush sale caches.
                    if (existing.date.getTime() !== matchDate.getTime()) {
                        progress.dateChangedMatchIds.push(existing.id as MatchId);
                    }

                    return;
                }

                await tx.matches.create({
                    data: {
                        date: matchDate,
                        competition,
                        atHome: match.atHome,
                        opponentId,
                        ...(resultData
                            ? {
                                  MatchResults: {
                                      create: resultData,
                                  },
                              }
                            : {}),
                    },
                });
            });
        }
    }

    async createMatch(payload: {
        date: string;
        atHome: boolean;
        opponent: string;
        competition: Competition;
        result?: {
            isWin: boolean;
            score: string;
        };
    }): Promise<void> {
        try {
            await this.prisma.matches.create({
                data: {
                    date: new Date(payload.date),
                    atHome: payload.atHome,
                    competition: payload.competition,
                    Opponent: {
                        connectOrCreate: {
                            create: {
                                name: payload.opponent,
                            },
                            where: {
                                name: payload.opponent,
                            },
                        },
                    },
                    ...(payload.result
                        ? {
                              MatchResults: {
                                  create: {
                                      isWin: payload.result.isWin,
                                      score: payload.result.score,
                                  },
                              },
                          }
                        : {}),
                },
            });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                return;
            }

            throw e;
        }

        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateMatches());
    }
}
