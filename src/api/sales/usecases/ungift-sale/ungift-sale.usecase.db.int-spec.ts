import { SaleStatus } from '@prisma/client';

import { UngiftSaleUsecaseDb } from './ungift-sale.usecase.db';
import type { ListedPrice } from '@psg/shared/money';
import { computeProfit } from '../../shared/profit.util';
import { PrismaService } from '../../../../db/prisma.service';
import {
    createRealDbSale,
    deleteRealDbSale,
    RealDbSale,
} from '../../test-support/real-db.fixtures';

describe('UngiftSaleUsecaseDb against a real database', () => {
    const prisma = new PrismaService();

    let usecaseDb: UngiftSaleUsecaseDb;
    let fixture: RealDbSale | undefined;

    beforeAll(async () => {
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    beforeEach(() => {
        usecaseDb = new UngiftSaleUsecaseDb(prisma);
    });

    afterEach(async () => {
        if (fixture) {
            await deleteRealDbSale(prisma, fixture);
        }

        fixture = undefined;
    });

    describe('when the gifted sale has a fractional profit', () => {
        beforeEach(async () => {
            fixture = await createRealDbSale(prisma, {
                status: SaleStatus.GIFTED,
                listedPrice: 501,
                profit: 440.88,
            });
        });

        it('snapshots the exact profit into history', async () => {
            const sale = fixture as RealDbSale;

            await usecaseDb.ungiftSale(sale.userId, sale.saleId, {
                id: sale.saleId,
                status: SaleStatus.GIFTED,
                listedPrice: 501,
                profit: 440.88,
            });

            const histories = await prisma.saleHistories.findMany({
                where: { saleId: sale.saleId },
            });

            expect(histories).toHaveLength(1);
            expect(histories[0]?.profit).toBe(440.88);
        });
    });

    describe('when the gifted sale has no price and a price is given', () => {
        const price = 100 as ListedPrice;

        beforeEach(async () => {
            fixture = await createRealDbSale(prisma, {
                status: SaleStatus.GIFTED,
                listedPrice: 0,
                profit: 0,
            });
        });

        it('ends PENDING at the given price and keeps the old 0/0 in history', async () => {
            const sale = fixture as RealDbSale;

            await usecaseDb.ungiftSale(
                sale.userId,
                sale.saleId,
                { id: sale.saleId, status: SaleStatus.GIFTED, listedPrice: 0, profit: 0 },
                { listedPrice: price, profit: computeProfit(price) },
            );

            const row = await prisma.sales.findUnique({ where: { id: sale.saleId } });
            const histories = await prisma.saleHistories.findMany({
                where: { saleId: sale.saleId },
            });

            expect(row).toMatchObject({
                status: SaleStatus.PENDING,
                listedPrice: price,
                profit: computeProfit(price),
            });
            expect(histories).toHaveLength(1);
            expect(histories[0]).toMatchObject({ listedPrice: 0, profit: 0 });
        });
    });
});
