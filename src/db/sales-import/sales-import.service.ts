import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';
import { PrismaService } from '../prisma.service';
import { BulkSaleInput, ISalesImportDbService } from './sales-import.db.interface';

@Injectable()
export class SalesImportService implements ISalesImportDbService {
    constructor(private readonly prisma: PrismaService) {}

    async bulkCreate(payload: {
        userId: UserId;
        batchId: string;
        sales: BulkSaleInput[];
    }): Promise<number> {
        if (payload.sales.length === 0) {
            return 0;
        }

        await this.prisma.$transaction(async (tx) => {
            for (const sale of payload.sales) {
                await tx.sales.create({
                    data: {
                        userId: payload.userId,
                        matchId: sale.matchId,
                        listedPrice: sale.listedPrice,
                        invest: sale.invest,
                        profit: sale.profit,
                        nbTickets: sale.nbTickets,
                        status: sale.status,
                        importBatchId: payload.batchId,
                        Allocations: {
                            create: sale.allocations.map((allocation) => ({
                                seasonPassId: allocation.seasonPassId,
                                nbTickets: allocation.nbTickets,
                            })),
                        },
                    },
                });
            }
        });

        return payload.sales.length;
    }

    async deleteBatch(userId: UserId, batchId: string): Promise<number> {
        const targets = await this.prisma.sales.findMany({
            where: { userId, importBatchId: batchId },
            select: { id: true },
        });

        if (targets.length === 0) {
            return 0;
        }

        const saleIds = targets.map((sale) => sale.id);

        await this.prisma.$transaction([
            this.prisma.saleHistories.deleteMany({
                where: { saleId: { in: saleIds } },
            }),
            this.prisma.salePassAllocations.deleteMany({
                where: { saleId: { in: saleIds } },
            }),
            this.prisma.sales.deleteMany({
                where: { userId, importBatchId: batchId },
            }),
        ]);

        return targets.length;
    }
}
