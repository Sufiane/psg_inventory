import type { MatchId, UserId } from '@psg/shared';
import { PrismaService } from '../prisma.service';
import { AccountingAggregate } from './types/get-accounting.type';
import { omit } from 'radash';
import { Prisma } from '.prisma/client';
import { SaleStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { IAccountingDbService } from './accounting.db.interface';
import { MatchRealizedProfit } from './types/match-realized-profit.type';
import { SoldLeadTime } from './types/sold-lead-time.type';

@Injectable()
export class AccountingService implements IAccountingDbService {
    constructor(private readonly prisma: PrismaService) {}

    async getAccounting(
        userId: UserId,
        status: SaleStatus,
        from: Date,
        to?: Date,
    ): Promise<AccountingAggregate | null> {
        const fields: Prisma.SalesSumAggregateInputType = {
            profit: true,
            nbTickets: true,
            invest: true,
            listedPrice: true,
        };

        const dbResult = await this.prisma.sales.aggregate({
            _sum: fields,
            _avg: fields,
            _min: omit(fields, ['invest']),
            _max: omit(fields, ['invest']),
            where: {
                userId,
                status,
                Match: {
                    date: {
                        gte: from,
                        lte: to,
                    },
                },
            },
        });

        // if we can't get the total of one of the values
        // it means we couldn't get any values
        if (dbResult._sum.listedPrice === null) {
            return null;
        }

        return dbResult as unknown as AccountingAggregate;
    }

    async getRealizedProfitPerMatch(
        userId: UserId,
        from: Date,
        to: Date,
    ): Promise<MatchRealizedProfit[]> {
        const sales = await this.prisma.sales.findMany({
            where: {
                userId,
                status: SaleStatus.SOLD,
                Match: { date: { gte: from, lte: to } },
            },
            select: {
                profit: true,
                matchId: true,
                Match: {
                    select: {
                        date: true,
                        competition: true,
                        atHome: true,
                        Opponent: { select: { name: true } },
                    },
                },
            },
        });

        const byMatch = new Map<MatchId, MatchRealizedProfit>();

        for (const sale of sales) {
            const matchId = sale.matchId as MatchId;
            const existing = byMatch.get(matchId);

            if (existing) {
                existing.matchProfit += sale.profit;
                continue;
            }

            byMatch.set(matchId, {
                matchId,
                date: sale.Match.date,
                opponent: sale.Match.Opponent.name,
                competition: sale.Match.competition,
                atHome: sale.Match.atHome,
                matchProfit: sale.profit,
            });
        }

        return [...byMatch.values()].sort(
            (firstMatch, secondMatch) =>
                firstMatch.date.getTime() - secondMatch.date.getTime(),
        );
    }

    async getSoldLeadTimes(
        userId: UserId,
        from: Date,
        to?: Date,
    ): Promise<SoldLeadTime[]> {
        const rows = await this.prisma.sales.findMany({
            where: {
                userId,
                status: SaleStatus.SOLD,
                soldAt: { not: null },
                Match: { date: { gte: from, lte: to } },
            },
            select: {
                soldAt: true,
                Match: { select: { date: true } },
            },
        });

        return rows
            .filter(
                (row): row is { soldAt: Date; Match: { date: Date } } =>
                    row.soldAt !== null,
            )
            .map((row) => ({ soldAt: row.soldAt, matchDate: row.Match.date }));
    }
}
