import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';

import type { SaleId, UserId } from '@psg/shared/ids';
import { PrismaService } from '../../../../db/prisma.service';

export abstract class IDeleteSaleUsecaseDb {
    abstract loadSale(
        userId: UserId,
        saleId: SaleId,
    ): Promise<{ id: string; status: SaleStatus } | null>;
    abstract deleteSale(userId: UserId, saleId: SaleId): Promise<void>;
}

@Injectable()
export class DeleteSaleUsecaseDb implements IDeleteSaleUsecaseDb {
    constructor(private readonly prisma: PrismaService) {}

    async loadSale(
        userId: UserId,
        saleId: SaleId,
    ): Promise<{ id: string; status: SaleStatus } | null> {
        return this.prisma.sales.findUnique({
            where: { userId, id: saleId },
            select: { id: true, status: true },
        });
    }

    async deleteSale(userId: UserId, saleId: SaleId): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await tx.gifts.deleteMany({ where: { saleId } });
            await tx.saleHistories.deleteMany({ where: { saleId } });
            await tx.salePassAllocations.deleteMany({ where: { saleId } });
            await tx.sales.delete({ where: { id: saleId, userId } });
        });
    }
}
