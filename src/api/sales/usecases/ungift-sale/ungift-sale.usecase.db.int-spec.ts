import { mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { UngiftSaleUsecaseDb } from './ungift-sale.usecase.db';
import { PrismaService } from '../../../../db/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
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
        usecaseDb = new UngiftSaleUsecaseDb(prisma, mockDeep<RedisService>());
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
});
