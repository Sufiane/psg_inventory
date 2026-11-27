import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { Prisma } from '@prisma/client';

import { DeleteSaleUsecaseDb } from './delete-sale.usecase.db';
import { PrismaService } from '../../../../db/prisma.service';
import type { SaleId, UserId } from '@psg/shared/ids';

describe('DeleteSaleUsecaseDb', () => {
    let usecaseDb: DeleteSaleUsecaseDb;
    let prisma: DeepMockProxy<PrismaService>;
    let warnSpy: Mock<typeof Logger.prototype.warn>;

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

        warnSpy = vi.spyOn(Logger.prototype, 'warn').mockClear();
    });

    function mockTransaction(): DeepMockProxy<Prisma.TransactionClient> {
        const tx = mockDeep<Prisma.TransactionClient>();

        (prisma.$transaction as Mock).mockImplementation(
            (callback: (tx: Prisma.TransactionClient) => unknown) => callback(tx),
        );

        return tx;
    }

    function p2025RecordGone(): Prisma.PrismaClientKnownRequestError {
        return new Prisma.PrismaClientKnownRequestError(
            'Record to delete does not exist.',
            {
                code: 'P2025',
                clientVersion: '6.0.1',
            },
        );
    }

    describe('loadSale', () => {
        it('queries prisma.sales.findUnique with userId and saleId', async () => {
            const expected = { id: saleId };
            prisma.sales.findUnique.mockResolvedValueOnce(expected as never);

            const result = await usecaseDb.loadSale(userId, saleId);

            expect(result).toEqual(expected);
            expect(prisma.sales.findUnique).toHaveBeenCalledWith({
                where: { userId, id: saleId },
                select: { id: true },
            });
        });

        it('returns null when the sale does not exist', async () => {
            prisma.sales.findUnique.mockResolvedValueOnce(null);

            const result = await usecaseDb.loadSale(userId, saleId);

            expect(result).toBeNull();
        });
    });

    describe('deleteSale', () => {
        let tx: DeepMockProxy<Prisma.TransactionClient>;

        beforeEach(() => {
            tx = mockTransaction();
        });

        it('deletes gifts, histories, allocations, and the sale in one transaction', async () => {
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
                select: { id: true },
            });
        });

        describe('when the delete succeeds', () => {
            beforeEach(() => {
                tx.sales.delete.mockResolvedValueOnce({ id: saleId } as never);
            });

            it('returns the deleted id', async () => {
                const result = await usecaseDb.deleteSale(userId, saleId);

                expect(result).toEqual({ id: saleId });
            });
        });

        describe('when the sale row is already gone', () => {
            beforeEach(() => {
                tx.sales.delete.mockRejectedValueOnce(p2025RecordGone());
            });

            it('returns null', async () => {
                const result = await usecaseDb.deleteSale(userId, saleId);

                expect(result).toBeNull();
            });

            it('logs the caught P2025', async () => {
                await usecaseDb.deleteSale(userId, saleId);

                expect(warnSpy).toHaveBeenCalledWith(
                    expect.stringContaining('P2025'),
                    expect.objectContaining({ code: 'P2025', userId, saleId }),
                );
            });
        });

        describe('when the delete fails for another reason', () => {
            const failure = new Error('db down');

            beforeEach(() => {
                tx.sales.delete.mockRejectedValueOnce(failure);
            });

            it('rethrows', async () => {
                await expect(usecaseDb.deleteSale(userId, saleId)).rejects.toBe(failure);
            });
        });
    });
});
