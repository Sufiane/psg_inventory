import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock } from 'vitest';
import { Prisma, SaleStatus } from '@prisma/client';

import { UngiftSaleUsecaseDb } from './ungift-sale.usecase.db';
import { PrismaService } from '../../../../db/prisma.service';
import type { SaleId, UserId } from '@psg/shared/ids';
import type { ListedPrice, Profit } from '@psg/shared/money';

describe('UngiftSaleUsecaseDb', () => {
    let usecaseDb: UngiftSaleUsecaseDb;
    let prisma: DeepMockProxy<PrismaService>;
    let warnSpy: Mock<typeof Logger.prototype.warn>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;

    const currentSale = {
        id: saleId,
        userId,
        status: SaleStatus.GIFTED,
        listedPrice: 100,
        profit: 90,
        invest: 50,
        nbTickets: 1,
        matchId: 'match-uuid',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        soldAt: null,
        cancelledAt: null,
    };

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UngiftSaleUsecaseDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
            ],
        }).compile();

        usecaseDb = module.get(UngiftSaleUsecaseDb);
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
        return new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
            code: 'P2025',
            clientVersion: '6.0.1',
        });
    }

    describe('loadSale', () => {
        it('queries prisma.sales.findUnique with userId, saleId and the snapshot fields', async () => {
            const expected = {
                id: saleId,
                status: SaleStatus.GIFTED,
                listedPrice: 100,
                profit: 90,
            };
            prisma.sales.findUnique.mockResolvedValueOnce(expected as never);

            const result = await usecaseDb.loadSale(userId, saleId);

            expect(result).toEqual(expected);
            expect(prisma.sales.findUnique).toHaveBeenCalledWith({
                where: { userId, id: saleId },
                select: { id: true, status: true, listedPrice: true, profit: true },
            });
        });

        it('returns null when the sale does not exist', async () => {
            prisma.sales.findUnique.mockResolvedValueOnce(null);

            const result = await usecaseDb.loadSale(userId, saleId);

            expect(result).toBeNull();
        });
    });

    describe('ungiftSale', () => {
        it('deletes gift rows, resets sale to PENDING, and creates history in one transaction', async () => {
            const tx = mockTransaction();

            const result = await usecaseDb.ungiftSale(userId, saleId, currentSale);

            // Gift rows deleted first (Postgres order constraint D15)
            expect(tx.gifts.deleteMany).toHaveBeenCalledWith({ where: { saleId } });

            // Sale status reset to PENDING (profit left unchanged —
            // undefined was stripped by shake() in the original)
            expect(tx.sales.update).toHaveBeenCalledWith({
                data: {
                    status: SaleStatus.PENDING,
                },
                where: { id: saleId, userId },
            });

            // History entry captures the pre-write state
            expect(tx.saleHistories.create).toHaveBeenCalledWith({
                data: {
                    saleId: currentSale.id,
                    listedPrice: currentSale.listedPrice,
                    profit: currentSale.profit,
                    status: currentSale.status,
                },
            });
            expect(result).toBe('written');
        });

        describe('when pricing is given', () => {
            it('writes the price and profit with the status reset', async () => {
                const tx = mockTransaction();

                await usecaseDb.ungiftSale(userId, saleId, currentSale, {
                    listedPrice: 120 as ListedPrice,
                    profit: 108 as Profit,
                });

                expect(tx.sales.update).toHaveBeenCalledWith({
                    data: { status: SaleStatus.PENDING, listedPrice: 120, profit: 108 },
                    where: { id: saleId, userId },
                });
            });
        });

        it('does not re-read the sale row — the usecase already loaded it', async () => {
            mockTransaction();

            await usecaseDb.ungiftSale(userId, saleId, currentSale);

            expect(prisma.sales.findUnique).not.toHaveBeenCalled();
        });
    });

    describe('when the sale row is deleted between the load and the write', () => {
        it('reports not_found and re-reads nothing', async () => {
            const tx = mockTransaction();
            tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

            const result = await usecaseDb.ungiftSale(userId, saleId, currentSale);

            expect(result).toBe('not_found');
            expect(prisma.sales.findUnique).not.toHaveBeenCalled();
        });

        it('logs the caught P2025 before returning not_found', async () => {
            const tx = mockTransaction();
            tx.sales.update.mockRejectedValueOnce(p2025RecordGone());

            const result = await usecaseDb.ungiftSale(userId, saleId, currentSale);

            expect(result).toBe('not_found');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('P2025'),
                expect.objectContaining({
                    code: 'P2025',
                    message: expect.any(String),
                }),
            );
        });
    });

    describe('when the transaction rejects with an unexpected error', () => {
        it('ungiftSale rethrows it unchanged', async () => {
            const tx = mockTransaction();
            const failure = new Error('connection lost');
            tx.sales.update.mockRejectedValueOnce(failure);

            await expect(usecaseDb.ungiftSale(userId, saleId, currentSale)).rejects.toBe(
                failure,
            );
        });
    });
});
