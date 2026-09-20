import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';

import type { SaleId, UserId } from '@psg/shared/ids';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { PrismaService } from '../../../../db/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';

export abstract class IUngiftSaleUsecaseDb {
    abstract loadSale(
        userId: UserId,
        saleId: SaleId,
    ): Promise<{ id: string; status: SaleStatus } | null>;
    abstract ungiftSale(userId: UserId, saleId: SaleId): Promise<void>;
}

@Injectable()
export class UngiftSaleUsecaseDb implements IUngiftSaleUsecaseDb {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async loadSale(
        userId: UserId,
        saleId: SaleId,
    ): Promise<{ id: string; status: SaleStatus } | null> {
        return this.prisma.sales.findUnique({
            where: { userId, id: saleId },
            select: { id: true, status: true },
        });
    }

    async ungiftSale(userId: UserId, saleId: SaleId): Promise<void> {
        const currentSale = await this.prisma.sales.findUnique({
            where: { userId, id: saleId },
        });

        if (!currentSale) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        await this.prisma.$transaction(async (tx) => {
            // Gift row first, then the status. Postgres rejects the reverse
            // order (spec D15).
            await tx.gifts.deleteMany({ where: { saleId } });

            // Reset status to PENDING. Timestamps only change for
            // SOLD/CANCELLED transitions — GIFTED → PENDING touches neither.
            // Profit is left unchanged (the undefined payload in the original
            // SalesDb.applySaleWrite was stripped by shake()).
            await tx.sales.update({
                data: {
                    status: SaleStatus.PENDING,
                },
                where: { id: saleId, userId },
            });

            // History entry captures the pre-write state.
            await tx.saleHistories.create({
                data: {
                    saleId: currentSale.id,
                    listedPrice: currentSale.listedPrice,
                    profit: currentSale.profit,
                    status: currentSale.status,
                },
            });
        });

        // Invalidate all sale-level caches.
        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId));
        await this.redisService.invalidate(CACHE_KEYS.sale(saleId));
        // Accounting and recipients caches (the write-path invalidation).
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateRecipients(userId),
        );
    }
}
