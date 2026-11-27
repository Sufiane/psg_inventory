import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { SaleId, UserId } from '@psg/shared/ids';
import { PrismaService } from '../../../../db/prisma.service';

export abstract class IDeleteSaleUsecaseDb {
    abstract loadSale(userId: UserId, saleId: SaleId): Promise<{ id: SaleId } | null>;
    abstract deleteSale(userId: UserId, saleId: SaleId): Promise<{ id: SaleId } | null>;
}

@Injectable()
export class DeleteSaleUsecaseDb implements IDeleteSaleUsecaseDb {
    private readonly logger = new Logger(DeleteSaleUsecaseDb.name);

    constructor(private readonly prisma: PrismaService) {}

    async loadSale(userId: UserId, saleId: SaleId): Promise<{ id: SaleId } | null> {
        const sale = await this.prisma.sales.findUnique({
            where: { userId, id: saleId },
            select: { id: true },
        });

        return sale as { id: SaleId } | null;
    }

    async deleteSale(userId: UserId, saleId: SaleId): Promise<{ id: SaleId } | null> {
        try {
            const deleted = await this.prisma.$transaction(async (tx) => {
                await tx.gifts.deleteMany({ where: { saleId } });
                await tx.saleHistories.deleteMany({ where: { saleId } });
                await tx.salePassAllocations.deleteMany({ where: { saleId } });

                return tx.sales.delete({
                    where: { id: saleId, userId },
                    select: { id: true },
                });
            });

            return deleted as { id: SaleId };
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2025'
            ) {
                this.logger.warn('deleteSale: P2025 mapped to the not-found outcome', {
                    code: error.code,
                    message: error.message,
                    meta: error.meta,
                    userId,
                    saleId,
                });

                return null;
            }

            throw error;
        }
    }
}
