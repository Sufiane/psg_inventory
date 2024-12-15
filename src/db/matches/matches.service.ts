import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FormattedMatch } from '../../shared/types/formatted-match.type';
import { convertStringToCompetition } from './matches.utils';
import { Competition } from '@prisma/client';
import { Prisma } from '.prisma/client';

@Injectable()
export class MatchesService extends PrismaService {
    getMatches(dates: { from: Date, to?: Date }, withResult: boolean = false) {
        const where: { date: { gte: Date, lte?: Date } } = {
            date: {
                gte: dates.from,
            },
        };

        if (dates.to) {
            where.date.lte = dates.to;
        }

        return this.matches.findMany({
            where: where,
            include: {
                Opponent: true,
                MatchResults: withResult,
            },
        });
    }

    getOneMatch(id: string, withResult: boolean = false) {
        return this.matches.findUnique({
            include: {
                Opponent: true,
                MatchResults: withResult,
            },
            where: {
                id,
            },
        });
    }

    async loadMatches(matches: FormattedMatch[]) {
        for (const match of matches) {
            await this.$transaction(async (tx) => {
                const { id: opponentId } = await this.opponents.upsert({
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

                await tx.matches.upsert({
                    create: {
                        date: match.date,
                        competition: convertStringToCompetition(match.competition),
                        atHome: match.atHome,
                        MatchResults: {
                            create: {
                                isWin: match.result.isWin,
                                score: match.result.score,
                            },
                        },
                        opponentId,
                    },
                    update: {},
                    where: {
                        date_opponentId: {
                            date: match.date,
                            opponentId,
                        },
                    },
                });
            });
        }
    }

    async createMatch(payload: {
        date: string,
        atHome: boolean,
        opponent: string,
        competition: Competition,
        result?: {
            isWin: boolean,
            score: string,
        }
    }): Promise<void> {
        try {
            await this.matches.create({
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
            if (
                e instanceof Prisma.PrismaClientKnownRequestError
                && e.code === 'P2002'
            ) {
                return;
            }

            throw e;
        }
    }
}
