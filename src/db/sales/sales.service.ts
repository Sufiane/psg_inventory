import { PrismaService } from '../prisma.service';
import { SaleStatus } from '@prisma/client';
import { shake } from 'radash';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { Injectable } from '@nestjs/common';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { Sale } from './type/sale.type';
import { SaleWithFullMatch } from './type/sale-with-full-match.type';
import { OldestMatchSale } from './type/oldest-match-sale.type';

@Injectable()
export class SalesService extends PrismaService {
    constructor(private readonly redisService: RedisService) {
        super();
    }

    static saleQuery = {
        include: {
            Match: {
                select: {
                    Opponent: true,
                },
            },
        },
    };

    async getOneSale(userId: string, saleId: string): Promise<Sale | null> {
        const cacheKey = CACHE_KEYS.sale(saleId);
        const cachedData = await this.redisService.get<Sale>(cacheKey);

        if (cachedData) {
            return cachedData;
        }

        const dbResult = await this.sales.findUnique({
            ...SalesService.saleQuery,
            where: {
                id: saleId,
                userId,
            },
        });

        await this.redisService.set(cacheKey, dbResult, ONE_HOUR_TTL);

        return dbResult;
    }

    async getSales(userId: string): Promise<Sale[]> {
        const cacheKey = CACHE_KEYS.sales(userId);
        const cachedData = await this.redisService.get<Sale[]>(cacheKey);

        if (cachedData) {
            return cachedData;
        }

        const dbResult = await this.sales.findMany({
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

        return dbResult;
    }

    async addSale(payload: {
        userId: string;
        profit: number;
        nbTickets: number;
        invest: number;
        matchId: string;
        listedPrice: number;
    }): Promise<{ id: string }> {
        const dbResult = await this.sales.create({
            data: {
                ...payload,
                status: SaleStatus.PENDING,
            },
            select: {
                id: true,
            },
        });

        await this.redisService.invalidate(CACHE_KEYS.sales(payload.userId));

        return {
            id: dbResult.id,
        };
    }

    async updateSale(payload: {
        saleId: string;
        userId: string;
        profit: number | undefined;
        nbTickets?: number;
        invest?: number;
        listedPrice?: number;
        sold?: boolean;
        status?: SaleStatus;
    }): Promise<void> {
        const currentSale = await this.sales.findUnique({
            where: {
                userId: payload.userId,
                id: payload.saleId,
            },
        });

        if (!currentSale) {
            throw new Error('current_sale_not_found');
        }

        await this.$transaction(async (tx) => {
            await tx.sales.update({
                data: shake({
                    profit: payload.profit,
                    nbTickets: payload.nbTickets,
                    invest: payload.invest,
                    listedPrice: payload.listedPrice,
                    status: payload.sold ? SaleStatus.SOLD : SaleStatus.PENDING,
                }),
                where: {
                    id: payload.saleId,
                    userId: payload.userId,
                },
            });

            await tx.saleHistories.create({
                data: {
                    saleId: currentSale.id,
                    listedPrice: currentSale.listedPrice,
                    profit: currentSale.profit,
                    status: currentSale.status,
                },
            });
        });

        await this.redisService.invalidate(CACHE_KEYS.sales(payload.userId));
        await this.redisService.invalidate(CACHE_KEYS.sale(payload.saleId));
    }

    async deleteSale(userId: string, saleId: string): Promise<void> {
        await this.$transaction(async (tx) => {
            await tx.saleHistories.deleteMany({
                where: {
                    saleId,
                },
            });

            await tx.sales.delete({
                where: {
                    id: saleId,
                    userId,
                },
            });
        });

        await this.redisService.invalidate(CACHE_KEYS.sales(userId));
        await this.redisService.invalidate(CACHE_KEYS.sale(saleId));
    }

    getOneByWithFullMatch(query: {
        profit?: number;
        listedPrice?: number;
        invest?: number;
        nbTickets?: number;
        status?: SaleStatus;
    }): Promise<SaleWithFullMatch> {
        return this.sales.findFirstOrThrow({
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
        }) as Promise<SaleWithFullMatch>;
    }

    async cancelMany() {
        await this.sales.updateMany({
            data: {
                status: SaleStatus.CANCELLED,
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
    }

    getOldestMatchSale(userId: string): Promise<OldestMatchSale> {
        return this.sales.findFirstOrThrow({
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
        });
    }
}
