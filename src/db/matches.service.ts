import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class MatchesService extends PrismaService {

    getMatchs(dates: { from: Date, to?: Date }, withResult: boolean = false) {
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
}
