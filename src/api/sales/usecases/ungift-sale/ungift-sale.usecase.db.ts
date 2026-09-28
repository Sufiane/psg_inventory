import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';

import type { SaleId, UserId } from '@psg/shared/ids';
import { PrismaService } from '../../../../db/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';

export type SaleRowSnapshot = {
    id: string;
    status: SaleStatus;
    listedPrice: number;
    profit: number;
};

// The db reports what physically happened — plain data, no domain
// imports (spec D2; keeps the D4 dependency-cruiser rule valid).
export type SaleWriteOutcome = 'written' | 'not_found';

export abstract class IUngiftSaleUsecaseDb {
    abstract loadSale(userId: UserId, saleId: SaleId): Promise<SaleRowSnapshot | null>;
    abstract ungiftSale(
        userId: UserId,
        saleId: SaleId,
        currentSale: SaleRowSnapshot,
    ): Promise<SaleWriteOutcome>;
}

@Injectable()
export class UngiftSaleUsecaseDb implements IUngiftSaleUsecaseDb {
    private readonly logger = new Logger(UngiftSaleUsecaseDb.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async loadSale(userId: UserId, saleId: SaleId): Promise<SaleRowSnapshot | null> {
        return this.prisma.sales.findUnique({
            where: { userId, id: saleId },
            select: { id: true, status: true, listedPrice: true, profit: true },
        });
    }

    async ungiftSale(
        userId: UserId,
        saleId: SaleId,
        currentSale: SaleRowSnapshot,
    ): Promise<SaleWriteOutcome> {
        try {
            await this.prisma.$transaction(async (tx) => {
                // Gift row first, then the status. Postgres rejects the reverse
                // order (spec D15).
                await tx.gifts.deleteMany({ where: { saleId } });

                // Reset status to PENDING. Timestamps only change for
                // SOLD/CANCELLED transitions — GIFTED → PENDING touches neither.
                await tx.sales.update({
                    data: { status: SaleStatus.PENDING },
                    where: { id: saleId, userId },
                });

                // History entry captures the pre-write state, from the row the
                // usecase already loaded.
                await tx.saleHistories.create({
                    data: {
                        saleId: currentSale.id,
                        listedPrice: currentSale.listedPrice,
                        profit: currentSale.profit,
                        status: currentSale.status,
                    },
                });
            });

            // Invalidate all four cache namespaces — written path only. On
            // not_found the transaction rolled back, nothing is stale because
            // of us, and the pre-fix throw also fired before any invalidation
            // (spec D2 / behaviour item 4).
            await this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId));
            await this.redisService.invalidate(CACHE_KEYS.sale(saleId));
            await this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateAccounting(userId),
            );
            await this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateRecipients(userId),
            );

            return 'written';
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2025'
            ) {
                // The row vanished between the usecase's load and this write;
                // Prisma rolled the transaction back. The only write in here
                // that can raise P2025 is tx.sales.update (deleteMany never
                // throws for missing rows, saleHistories.create would raise
                // P2003), so this mapping is exact. The db reports what
                // happened as data — the usecase decides what it means.
                // The caught error is logged first so the original
                // code/message/meta stays diagnosable (spec behaviour item 3).
                this.logger.warn('ungiftSale: P2025 mapped to the not-found outcome', {
                    code: error.code,
                    message: error.message,
                    meta: error.meta,
                });

                return 'not_found';
            }

            throw error;
        }
    }
}
