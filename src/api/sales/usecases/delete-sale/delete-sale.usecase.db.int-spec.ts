import { SaleStatus } from '@prisma/client';

import { DeleteSaleUsecaseDb } from './delete-sale.usecase.db';
import { PrismaService } from '../../../../db/prisma.service';
import {
    createRealDbSale,
    deleteRealDbSale,
    RealDbSale,
} from '../../test-support/real-db.fixtures';

describe('DeleteSaleUsecaseDb against a real database', () => {
    const prisma = new PrismaService();

    let usecaseDb: DeleteSaleUsecaseDb;
    let fixture: RealDbSale | undefined;

    beforeAll(async () => {
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    beforeEach(() => {
        usecaseDb = new DeleteSaleUsecaseDb(prisma);
    });

    afterEach(async () => {
        if (fixture) {
            await deleteRealDbSale(prisma, fixture);
        }

        fixture = undefined;
    });

    describe('when the sale exists', () => {
        beforeEach(async () => {
            fixture = await createRealDbSale(prisma, {
                status: SaleStatus.GIFTED,
                listedPrice: 100,
                profit: 90,
            });
        });

        it('returns the deleted id', async () => {
            const sale = fixture as RealDbSale;

            const result = await usecaseDb.deleteSale(sale.userId, sale.saleId);

            expect(result).toEqual({ id: sale.saleId });
        });
    });

    describe('when the sale was already deleted', () => {
        beforeEach(async () => {
            fixture = await createRealDbSale(prisma, {
                status: SaleStatus.PENDING,
                listedPrice: 100,
                profit: 90,
            });

            await usecaseDb.deleteSale(fixture.userId, fixture.saleId);
        });

        it('returns null', async () => {
            const sale = fixture as RealDbSale;

            const result = await usecaseDb.deleteSale(sale.userId, sale.saleId);

            expect(result).toBeNull();
        });
    });
});
