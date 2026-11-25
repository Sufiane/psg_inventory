import { mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { UpdateSaleUsecaseDb } from './update-sale.usecase.db';
import { PrismaService } from '../../../../db/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { IRecipientsDbService } from '../../../../db/recipients/recipients.db.interface';
import {
    createRealDbSale,
    deleteRealDbSale,
    RealDbSale,
} from '../../test-support/real-db.fixtures';

describe('UpdateSaleUsecaseDb against a real database', () => {
    const prisma = new PrismaService();

    let usecaseDb: UpdateSaleUsecaseDb;
    let fixture: RealDbSale | undefined;

    beforeAll(async () => {
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    beforeEach(() => {
        usecaseDb = new UpdateSaleUsecaseDb(
            prisma,
            mockDeep<RedisService>(),
            mockDeep<ISalesDbService>(),
            mockDeep<IRecipientsDbService>(),
        );
    });

    afterEach(async () => {
        if (fixture) {
            await deleteRealDbSale(prisma, fixture);
        }

        fixture = undefined;
    });

    describe('when the sale has a fractional profit', () => {
        beforeEach(async () => {
            fixture = await createRealDbSale(prisma, {
                status: SaleStatus.PENDING,
                listedPrice: 501,
                profit: 440.88,
            });
        });

        it('snapshots the exact profit into history', async () => {
            const sale = fixture as RealDbSale;

            await usecaseDb.updateSale({
                saleId: sale.saleId,
                userId: sale.userId,
                profit: undefined,
                status: 'SOLD',
                currentSale: {
                    id: sale.saleId,
                    status: SaleStatus.PENDING,
                    listedPrice: 501,
                    profit: 440.88,
                },
            });

            const histories = await prisma.saleHistories.findMany({
                where: { saleId: sale.saleId },
            });

            expect(histories).toHaveLength(1);
            expect(histories[0]?.profit).toBe(440.88);
        });
    });
});
