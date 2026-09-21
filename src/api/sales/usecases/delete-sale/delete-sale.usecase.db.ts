import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';

import type { SaleId, UserId } from '@psg/shared/ids';
import { PrismaService } from '../../../../db/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';

export abstract class IDeleteSaleUsecaseDb {
    abstract loadSale(
        userId: UserId,
        saleId: SaleId,
    ): Promise<{ id: string; status: SaleStatus } | null>;
    abstract deleteSale(
        userId: UserId,
        saleId: SaleId,
        saleStatus: SaleStatus,
    ): Promise<void>;
}

@Injectable()
export class DeleteSaleUsecaseDb implements IDeleteSaleUsecaseDb {
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

    async deleteSale(
        userId: UserId,
        saleId: SaleId,
        saleStatus: SaleStatus,
    ): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await tx.gifts.deleteMany({ where: { saleId } });
            await tx.saleHistories.deleteMany({ where: { saleId } });
            await tx.salePassAllocations.deleteMany({ where: { saleId } });
            await tx.sales.delete({ where: { id: saleId, userId } });
        });

        // Invalidate all sale-level caches.
        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId));
        await this.redisService.invalidate(CACHE_KEYS.sale(saleId));
        // Accounting cache always.
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
        // Recipients cache only when a gift was destroyed (giftCount moves).
        if (saleStatus === SaleStatus.GIFTED) {
            await this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        }
    }
}
