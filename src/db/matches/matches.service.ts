import { PrismaService } from '../prisma.service';
import { FormattedMatch } from '../../shared/types/formatted-match.type';
import { convertStringToCompetition } from './matches.utils';
import { Competition } from '@prisma/client';
import { Prisma } from '.prisma/client';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import type { MatchId } from '@psg/shared/ids';
import { Match } from './types/match.type';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { IMatchesDbService } from './matches.db.interface';

@Injectable()
export class MatchesService implements IMatchesDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    static matchQuery(withResult: boolean = false) {
        return {
            include: {
                Opponent: true,
                MatchResults: withResult,
            },
        };
    }

    async getMatches(
        dates: { from: Date; to?: Date },
        withResult: boolean = false,
    ): Promise<Match[]> {
        const where: { date: { gte: Date; lte?: Date } } = {
            date: {
                gte: dates.from,
            },
        };

        if (dates.to) {
            where.date.lte = dates.to;
        }

        const cacheKey = CACHE_KEYS.matches(dates.from, dates.to, withResult);
        const cached = await this.redisService.get<Match[]>(cacheKey);

        if (cached !== null) {
            // if by mistake there is a null value in cache
            return cached.value ?? [];
        }

        const dbResult = await this.prisma.matches.findMany({
            ...MatchesService.matchQuery(withResult),
            where: where,
        });

        await this.redisService.set(cacheKey, dbResult, ONE_HOUR_TTL);

        return dbResult as Match[];
    }

    async getOneMatch(id: MatchId, withResult: boolean = false): Promise<Match | null> {
        const cacheKey = CACHE_KEYS.match(id);
        const cached = await this.redisService.get<Match>(cacheKey);

        if (cached !== null) {
            return cached.value;
        }

        const dbResult = await this.prisma.matches.findUnique({
            ...MatchesService.matchQuery(withResult),
            where: {
                id,
            },
        });

        await this.redisService.set(cacheKey, dbResult, ONE_HOUR_TTL);

        return dbResult as Match | null;
    }

    async loadMatches(matches: FormattedMatch[]): Promise<void> {
        for (const match of matches) {
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
                    select: { id: true },
                    where: {
                        opponentId,
                        date: { gte: dayStart, lte: dayEnd },
                    },
                });

                const competition = convertStringToCompetition(match.competition);
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

        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateMatches());
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
                    MatchResults: payload.result && {
                        create: {
                            isWin: payload.result.isWin,
                            score: payload.result.score,
                        },
                    },
                },
            });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                return;
            }

            throw e;
        }

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateMatches(new Date(payload.date)),
        );
    }
}
