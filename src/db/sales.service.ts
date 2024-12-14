import { PrismaService } from './prisma.service';
import { Matches, Opponents, Sales, SaleStatus } from '@prisma/client';
import { shake } from 'radash';

export class SalesService extends PrismaService {
    getOneSale(userId: string, saleId: string) {
        return this.sales.findUnique({
            where: {
                id: saleId,
                userId,
            },
        });
    }

    getSales(userId: string) {
        return this.sales.findMany({
            include: {
                Match: {
                    select: {
                        Opponent: true,
                    },
                },
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

    async addSale(payload: {
        userId: string,
        profit: number,
        nbTickets: number,
        invest: number,
        matchId: string,
        listedPrice: number,
    }): Promise<void> {
        await this.sales.create({
            data: {
                ...payload,
                status: SaleStatus.PENDING,
            },
        });
    }

    async updateSale(payload: {
        saleId: string,
        userId: string,
        profit: number | undefined,
        nbTickets?: number,
        invest?: number,
        listedPrice?: number,
        sold?: boolean,
        status?: SaleStatus,
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
    }

    getOneByWithFullMatch(query: {
        profit?: number,
        listedPrice?: number,
        invest?: number,
        nbTickets?: number
    }) {
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
        }) as Promise<Sales & { Match: Matches & { Opponent: Opponents } }>;
    }

    cancelMany() {
        return this.sales.updateMany({
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
}
