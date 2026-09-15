import { Injectable } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import type { UserId } from '@psg/shared/ids';
import { PrismaService } from '../prisma.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { IRecipientsDbService } from '../recipients/recipients.db.interface';
import { BulkSaleInput, ISalesImportDbService } from './sales-import.db.interface';

@Injectable()
export class SalesImportService implements ISalesImportDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
        private readonly recipientsDbService: IRecipientsDbService,
    ) {}

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
                const created = await tx.sales.create({
                    data: {
                        userId: payload.userId,
                        matchId: sale.matchId,
                        listedPrice: sale.listedPrice,
                        invest: sale.invest,
                        profit: sale.profit,
                        nbTickets: sale.nbTickets,
                        status: sale.status,
                        soldAt: sale.soldAt,
                        importBatchId: payload.batchId,
                        Allocations: {
                            create: sale.allocations.map((allocation) => ({
                                seasonPassId: allocation.seasonPassId,
                                nbTickets: allocation.nbTickets,
                            })),
                        },
                    },
                    select: { id: true },
                });

                // Resolved (or created) on this same tx, so a rolled-back
                // import cannot leave an orphaned recipient behind (spec D8,
                // D10) — the same call giftSale makes for the manual flow
                // (src/db/sales/sales.service.ts).
                if (sale.gift != null) {
                    const recipientId = await this.resolveRecipientId(
                        tx,
                        payload.userId,
                        sale.gift.recipientName,
                    );

                    await tx.gifts.create({
                        data: {
                            saleId: created.id,
                            saleStatus: SaleStatus.GIFTED,
                            recipientId,
                            giftedAt: sale.gift.giftedAt,
                        },
                    });
                }
            }
        });

        // Settled, not awaited bare, for the same reason deleteBatch below
        // does it: the transaction has already committed, so a Redis blip
        // must not throw out of here and leave the caller reporting a failed
        // import that actually persisted.
        await Promise.allSettled([
            this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateSales(payload.userId),
            ),
        ]);

        return payload.sales.length;
    }

    private async resolveRecipientId(
        tx: Prisma.TransactionClient,
        userId: UserId,
        recipientName: string,
    ): Promise<string> {
        const recipient = await this.recipientsDbService.findOrCreateForUser(
            userId,
            recipientName,
            tx,
        );

        return recipient.id;
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
            this.prisma.gifts.deleteMany({
                where: { saleId: { in: saleIds } },
            }),
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

        // Mirrors cancelMany's own bulk invalidation in
        // src/db/sales/sales.service.ts: each deleted sale may have a cached
        // detail entry from before the revert, plus the user's list/range
        // cache.
        await Promise.allSettled([
            ...saleIds.map((id) => this.redisService.invalidate(CACHE_KEYS.sale(id))),
            this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId)),
        ]);

        return targets.length;
    }
}
