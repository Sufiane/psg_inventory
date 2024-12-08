import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FormattedMatch } from '../../shared/types/formatted-match.type';
import { convertStringToCompetition } from './matches.utils';

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
            ...(withResult ? {
                include: {
                    MatchResults: true,
                },
            } : {}),
        });
    }

    getOneMatch(id: string, withResult: boolean = false) {
        return this.matches.findUnique({
            ...(withResult ? {
                include: {
                    MatchResults: true,
                },
            } : {}),
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
}
