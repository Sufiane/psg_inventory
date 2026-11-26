import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { Prisma, SaleStatus } from '@prisma/client';

import { DeleteSaleUsecaseDb } from './delete-sale.usecase.db';
import { PrismaService } from '../../../../db/prisma.service';
import type { SaleId, UserId } from '@psg/shared/ids';

describe('DeleteSaleUsecaseDb', () => {
    let usecaseDb: DeleteSaleUsecaseDb;
    let prisma: DeepMockProxy<PrismaService>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                DeleteSaleUsecaseDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
            ],
        }).compile();

        usecaseDb = module.get(DeleteSaleUsecaseDb);
        prisma = module.get(PrismaService);

        module.useLogger(false);
    });

    function mockTransaction(): DeepMockProxy<Prisma.TransactionClient> {
        const tx = mockDeep<Prisma.TransactionClient>();

        (prisma.$transaction as Mock).mockImplementation(
            (callback: (tx: Prisma.TransactionClient) => unknown) => callback(tx),
        );

        return tx;
    }

    describe('loadSale', () => {
        it('queries prisma.sales.findUnique with userId and saleId', async () => {
            const expected = { id: saleId, status: SaleStatus.PENDING };
            prisma.sales.findUnique.mockResolvedValueOnce(expected as never);

            const result = await usecaseDb.loadSale(userId, saleId);

            expect(result).toEqual(expected);
            expect(prisma.sales.findUnique).toHaveBeenCalledWith({
                where: { userId, id: saleId },
                select: { id: true, status: true },
            });
        });

        it('returns null when the sale does not exist', async () => {
            prisma.sales.findUnique.mockResolvedValueOnce(null);

            const result = await usecaseDb.loadSale(userId, saleId);

            expect(result).toBeNull();
        });
    });

    describe('deleteSale', () => {
        it('deletes gifts, histories, allocations, and the sale in one transaction', async () => {
            const tx = mockTransaction();

            await usecaseDb.deleteSale(userId, saleId);

            expect(tx.gifts.deleteMany).toHaveBeenCalledWith({ where: { saleId } });
            expect(tx.saleHistories.deleteMany).toHaveBeenCalledWith({
                where: { saleId },
            });
            expect(tx.salePassAllocations.deleteMany).toHaveBeenCalledWith({
                where: { saleId },
            });
            expect(tx.sales.delete).toHaveBeenCalledWith({
                where: { id: saleId, userId },
            });
        });
    });
});
