import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';

import type { UserId } from '@psg/shared/ids';
import { AccountingDb } from './accounting.db';
import { PrismaService } from '../prisma.service';

describe('AccountingDb', () => {
    const userId = 'user-1' as UserId;

    let db: AccountingDb;
    let prismaService: DeepMockProxy<PrismaService>;

    beforeEach(async () => {
        prismaService = mockDeep<PrismaService>();

        const module = await Test.createTestingModule({
            providers: [
                AccountingDb,
                { provide: PrismaService, useValue: prismaService },
            ],
        }).compile();

        db = module.get(AccountingDb);
    });

    describe('getAccounting', () => {
        describe('when sales match', () => {
            const aggregate = {
                _sum: { listedPrice: 300 },
                _count: { _all: 3 },
            };

            beforeEach(() => {
                prismaService.sales.aggregate.mockResolvedValueOnce(aggregate as never);
            });

            it('asks prisma for the row count', async () => {
                await db.getAccounting(userId, [SaleStatus.SOLD], new Date('2026-07-01'));

                expect(prismaService.sales.aggregate).toHaveBeenCalledWith(
                    expect.objectContaining({ _count: { _all: true } }),
                );
            });

            it('returns the aggregate with its count', async () => {
                const result = await db.getAccounting(
                    userId,
                    [SaleStatus.SOLD],
                    new Date('2026-07-01'),
                );

                expect(result).toEqual(aggregate);
            });
        });

        describe('when the listed price sum is null', () => {
            beforeEach(() => {
                prismaService.sales.aggregate.mockResolvedValueOnce({
                    _sum: { listedPrice: null },
                    _count: { _all: 0 },
                } as never);
            });

            it('returns null', async () => {
                const result = await db.getAccounting(
                    userId,
                    [SaleStatus.SOLD],
                    new Date('2026-07-01'),
                );

                expect(result).toBeNull();
            });
        });
    });
});
