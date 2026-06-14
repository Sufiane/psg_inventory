import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';
import { shake } from 'radash';

import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, SaleId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../prisma.service';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { Sale } from './type/sale.type';
import { SaleWithFullMatch } from './type/sale-with-full-match.type';
import { OldestMatchSale } from './type/oldest-match-sale.type';
import { ISalesDbService, SaleAllocationInput } from './sales.db.interface';

function sumTickets(allocations: SaleAllocationInput[]): TicketCount {
    return allocations.reduce(
        (total, allocation) => total + allocation.nbTickets,
        0,
    ) as TicketCount;
}

@Injectable()
export class SalesService implements ISalesDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    static saleQuery = {
        include: {
            Match: {
                select: {
                    date: true,
                    Opponent: true,
                },
            },
            Allocations: {
                select: {
                    id: true,
                    seasonPassId: true,
                    nbTickets: true,
                },
            },
        },
    };

    async getOneSale(userId: UserId, saleId: SaleId): Promise<Sale | null> {
        const cacheKey = CACHE_KEYS.sale(saleId);
        const cached = await this.redisService.get<Sale>(cacheKey);

        if (cached !== null) {
            return cached.value;
        }

        const dbResult = await this.prisma.sales.findUnique({
            ...SalesService.saleQuery,
            where: {
                id: saleId,
                userId,
            },
        });

        await this.redisService.set(cacheKey, dbResult, ONE_HOUR_TTL);

        return dbResult as Sale | null;
    }

    async getSales(userId: UserId): Promise<Sale[]> {
        const cacheKey = CACHE_KEYS.sales(userId);
        const cached = await this.redisService.get<Sale[]>(cacheKey);

        if (cached !== null) {
            // in case we have a valid null value
            return cached.value ?? [];
        }

        const dbResult = await this.prisma.sales.findMany({
            ...SalesService.saleQuery,
            where: {
                userId,
            },
            orderBy: {
                Match: {
                    date: 'asc',
                },
            },
        });

        await this.redisService.set(cacheKey, dbResult, ONE_HOUR_TTL);

        return dbResult as Sale[];
    }

    async getSalesByRange(
        userId: UserId,
        range: { from: Date; to: Date },
    ): Promise<Sale[]> {
        const cacheKey = CACHE_KEYS.salesByRange(userId, range.from, range.to);
        const cached = await this.redisService.get<Sale[]>(cacheKey);

        if (cached !== null) {
            return cached.value ?? [];
        }

        const dbResult = await this.prisma.sales.findMany({
            ...SalesService.saleQuery,
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
        });

        await this.redisService.set(cacheKey, dbResult, ONE_HOUR_TTL);

        return dbResult as Sale[];
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

    async updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        sold?: boolean;
        status?: SaleStatus;
        allocations?: SaleAllocationInput[];
    }): Promise<void> {
        const currentSale = await this.prisma.sales.findUnique({
            where: {
                userId: payload.userId,
                id: payload.saleId,
            },
        });

        if (!currentSale) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        const nextStatus: SaleStatus =
            payload.sold === undefined
                ? currentSale.status
                : payload.sold
                  ? SaleStatus.SOLD
                  : SaleStatus.PENDING;

        const wasSold = currentSale.status === SaleStatus.SOLD;
        const willBeSold = nextStatus === SaleStatus.SOLD;
        const wasCancelled = currentSale.status === SaleStatus.CANCELLED;
        const willBeCancelled = nextStatus === SaleStatus.CANCELLED;

        // soldAt / cancelledAt mirror the current status: set on entry into the
        // state, null on exit. The full transition trail lives in
        // sale_histories, so clearing here loses no audit data.
        const timestampPatch: {
            soldAt?: Date | null;
            cancelledAt?: Date | null;
        } = {};

        if (willBeSold && !wasSold) {
            timestampPatch.soldAt = new Date();
        } else if (!willBeSold && wasSold) {
            timestampPatch.soldAt = null;
        }

        if (willBeCancelled && !wasCancelled) {
            timestampPatch.cancelledAt = new Date();
        } else if (!willBeCancelled && wasCancelled) {
            timestampPatch.cancelledAt = null;
        }

        await this.prisma.$transaction(async (tx) => {
            const nbTicketsPatch =
                payload.allocations != null
                    ? { nbTickets: sumTickets(payload.allocations) }
                    : {};

            await tx.sales.update({
                data: shake({
                    profit: payload.profit,
                    invest: payload.invest,
                    listedPrice: payload.listedPrice,
                    status: nextStatus,
                    ...nbTicketsPatch,
                    ...timestampPatch,
                }),
                where: {
                    id: payload.saleId,
                    userId: payload.userId,
                },
            });

            if (payload.allocations != null) {
                await tx.salePassAllocations.deleteMany({
                    where: { saleId: payload.saleId },
                });
                await tx.salePassAllocations.createMany({
                    data: payload.allocations.map((allocation) => ({
                        saleId: payload.saleId,
                        seasonPassId: allocation.seasonPassId,
                        nbTickets: allocation.nbTickets,
                    })),
                });
            }

            await tx.saleHistories.create({
                data: {
                    saleId: currentSale.id,
                    listedPrice: currentSale.listedPrice,
                    profit: currentSale.profit,
                    status: currentSale.status,
                },
            });
        });

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateSales(payload.userId),
        );
        await this.redisService.invalidate(CACHE_KEYS.sale(payload.saleId));
    }

    async deleteSale(userId: UserId, saleId: SaleId): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await tx.saleHistories.deleteMany({
                where: {
                    saleId,
                },
            });

            await tx.salePassAllocations.deleteMany({
                where: { saleId },
            });

            await tx.sales.delete({
                where: {
                    id: saleId,
                    userId,
                },
            });
        });

        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId));
        await this.redisService.invalidate(CACHE_KEYS.sale(saleId));
    }

    getOneByWithFullMatch(query: {
        profit?: Profit;
        listedPrice?: ListedPrice;
        invest?: Invest;
        nbTickets?: TicketCount;
        status?: SaleStatus;
    }): Promise<SaleWithFullMatch> {
        return this.prisma.sales.findFirstOrThrow({
            include: {
                Match: {
                    include: {
                        Opponent: true,
                    },
                },
            },
            where: query,
            orderBy: {
                Match: {
                    date: 'asc',
                },
            },
        }) as unknown as Promise<SaleWithFullMatch>;
    }

    async cancelMany() {
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
