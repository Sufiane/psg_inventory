import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';

import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, SaleId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../prisma.service';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { saleQuery } from './sales.query';
import { Sale, SalesGroup } from './type/sale.type';
import { SaleWithFullMatch } from './type/sale-with-full-match.type';
import { OldestMatchSale } from './type/oldest-match-sale.type';
import { ISalesDbService, SaleAllocationInput } from './sales.db.interface';
import { buildInclusiveDateRangeFilter } from '../shared/date-range.util';

function sumTickets(allocations: SaleAllocationInput[]): TicketCount {
    return allocations.reduce(
        (total, allocation) => total + allocation.nbTickets,
        0,
    ) as TicketCount;
}

@Injectable()
export class SalesDb implements ISalesDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async getOneSale(userId: UserId, saleId: SaleId): Promise<Sale | null> {
        return this.redisService.get(
            CACHE_KEYS.sale(saleId),
            ONE_HOUR_TTL,
            () =>
                this.prisma.sales.findUnique({
                    ...saleQuery,
                    where: {
                        id: saleId,
                        userId,
                    },
                }) as Promise<Sale | null>,
        );
    }

    async getSales(userId: UserId): Promise<Sale[]> {
        const result = await this.redisService.get(
            CACHE_KEYS.sales(userId),
            ONE_HOUR_TTL,
            () =>
                this.prisma.sales.findMany({
                    ...saleQuery,
                    where: {
                        userId,
                    },
                    orderBy: {
                        Match: {
                            date: 'asc',
                        },
                    },
                }) as Promise<Sale[]>,
        );

        // in case we have a valid null value
        return result ?? [];
    }

    async getSalesByRange(
        userId: UserId,
        range: { from: Date; to: Date },
    ): Promise<Sale[]> {
        const result = await this.redisService.get(
            CACHE_KEYS.salesByRange(userId, range.from, range.to),
            ONE_HOUR_TTL,
            () =>
                this.prisma.sales.findMany({
                    ...saleQuery,
                    where: {
                        userId,
                        Match: {
                            is: {
                                date: {
                                    gte: range.from,
                                    lt: range.to,
                                },
                            },
                        },
                    },
                    orderBy: {
                        Match: {
                            date: 'asc',
                        },
                    },
                }) as Promise<Sale[]>,
        );

        return result ?? [];
    }

    async getSalesGrouped(
        userId: UserId,
        range: { from: Date; to: Date },
    ): Promise<SalesGroup> {
        const sales = await this.getSalesByRange(userId, range);

        const pending: Sale[] = [];
        const terminal: Sale[] = [];

        for (const sale of sales) {
            if (sale.status === 'PENDING') {
                pending.push(sale);
            } else {
                terminal.push(sale);
            }
        }

        return { pending, terminal };
    }

    async addSale(payload: {
        userId: UserId;
        profit: Profit;
        invest: Invest;
        matchId: MatchId;
        listedPrice: ListedPrice;
        allocations: SaleAllocationInput[];
    }): Promise<{ id: SaleId }> {
        const nbTickets = sumTickets(payload.allocations);

        const dbResult = await this.prisma.sales.create({
            data: {
                userId: payload.userId,
                profit: payload.profit,
                invest: payload.invest,
                matchId: payload.matchId,
                listedPrice: payload.listedPrice,
                nbTickets,
                status: SaleStatus.PENDING,
                Allocations: {
                    create: payload.allocations.map((allocation) => ({
                        seasonPassId: allocation.seasonPassId,
                        nbTickets: allocation.nbTickets,
                    })),
                },
            },
            select: {
                id: true,
            },
        });

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateSales(payload.userId),
        );

        return {
            id: dbResult.id as SaleId,
        };
    }

    getOneByWithFullMatch(query: {
        profit?: Profit;
        listedPrice?: ListedPrice;
        invest?: Invest;
        nbTickets?: TicketCount;
        statuses?: SaleStatus[];
        userId: UserId;
        matchDateFrom: Date;
        matchDateTo?: Date;
    }): Promise<SaleWithFullMatch> {
        const { matchDateFrom, matchDateTo, statuses, ...saleFields } = query;

        return this.prisma.sales.findFirstOrThrow({
            include: {
                Match: {
                    include: {
                        Opponent: true,
                    },
                },
            },
            where: {
                ...saleFields,
                ...(statuses != null ? { status: { in: statuses } } : {}),
                Match: {
                    date: buildInclusiveDateRangeFilter(matchDateFrom, matchDateTo),
                },
            },
            orderBy: {
                Match: {
                    date: 'asc',
                },
            },
        }) as unknown as Promise<SaleWithFullMatch>;
    }

    async cancelMany(): Promise<void> {
        const affected = await this.prisma.sales.findMany({
            select: { id: true, userId: true },
            where: {
                Match: { is: { date: { lte: new Date() } } },
                status: SaleStatus.PENDING,
            },
        });

        if (affected.length === 0) {
            return;
        }

        const cancelledAt = new Date();

        await this.prisma.sales.updateMany({
            data: {
                status: SaleStatus.CANCELLED,
                cancelledAt,
                soldAt: null,
            },
            where: {
                Match: {
                    is: {
                        date: {
                            lte: new Date(),
                        },
                    },
                },
                status: SaleStatus.PENDING,
            },
        });

        const userIds = [...new Set(affected.map((s) => s.userId as UserId))];

        await Promise.allSettled([
            ...affected.map((s) => this.redisService.invalidate(CACHE_KEYS.sale(s.id))),
            ...userIds.map((id) =>
                this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(id)),
            ),
            ...userIds.map((id) =>
                this.redisService.invalidatePattern(CACHE_KEYS.invalidateAccounting(id)),
            ),
        ]);
    }

    getOldestMatchSale(userId: UserId): Promise<OldestMatchSale> {
        return this.prisma.sales.findFirstOrThrow({
            include: {
                Match: true,
            },
            where: {
                userId,
            },
            orderBy: {
                Match: {
                    date: 'asc',
                },
            },
        }) as unknown as Promise<OldestMatchSale>;
    }
}
