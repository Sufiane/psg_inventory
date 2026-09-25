import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { GetSeasonAccountingUsecaseDb } from './get-season-accounting.usecase.db';
import { IAccountingDbService } from '../../../../db/accounting/accounting.db.interface';
import { ISalesDbService } from '../../../../db/sales/sales.db.interface';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import type { AccountingAggregate } from '../../../../db/accounting/types/get-accounting.type';
import type { SoldLeadTime } from '../../../../db/accounting/types/sold-lead-time.type';
import type { SaleWithFullMatch } from '../../../../db/sales/type/sale-with-full-match.type';
import type { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';

describe('GetSeasonAccountingUsecaseDb', () => {
    let usecaseDb: GetSeasonAccountingUsecaseDb;
    let accountingDb: DeepMockProxy<IAccountingDbService>;
    let salesDb: DeepMockProxy<ISalesDbService>;
    let seasonPassesDb: DeepMockProxy<ISeasonPassesDbService>;

    const userId = 'user-uuid' as UserId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                GetSeasonAccountingUsecaseDb,
                {
                    provide: IAccountingDbService,
                    useValue: mockDeep<IAccountingDbService>(),
                },
                { provide: ISalesDbService, useValue: mockDeep<ISalesDbService>() },
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<ISeasonPassesDbService>(),
                },
            ],
        }).compile();

        usecaseDb = module.get(GetSeasonAccountingUsecaseDb);
        accountingDb = module.get(IAccountingDbService);
        salesDb = module.get(ISalesDbService);
        seasonPassesDb = module.get(ISeasonPassesDbService);

        module.useLogger(false);
    });

    describe('getAccounting', () => {
        it('delegates to IAccountingDbService with the same arguments', async () => {
            const aggregate = { _min: {}, _max: {} } as AccountingAggregate;
            accountingDb.getAccounting.mockResolvedValueOnce(aggregate);

            const from = new Date('2025-08-01');
            const to = new Date('2026-07-31');
            const result = await usecaseDb.getAccounting(
                userId,
                [SaleStatus.SOLD],
                from,
                to,
            );

            expect(accountingDb.getAccounting).toHaveBeenCalledWith(
                userId,
                [SaleStatus.SOLD],
                from,
                to,
            );
            expect(result).toBe(aggregate);
        });
    });

    describe('getSoldLeadTimes', () => {
        it('delegates to IAccountingDbService with the same arguments', async () => {
            const rows = [
                { soldAt: new Date(), matchDate: new Date() },
            ] as SoldLeadTime[];
            accountingDb.getSoldLeadTimes.mockResolvedValueOnce(rows);

            const from = new Date('2025-08-01');
            const result = await usecaseDb.getSoldLeadTimes(userId, from);

            expect(accountingDb.getSoldLeadTimes).toHaveBeenCalledWith(
                userId,
                from,
                undefined,
            );
            expect(result).toBe(rows);
        });
    });

    describe('getOneByWithFullMatch', () => {
        it('delegates to ISalesDbService with the same query', async () => {
            const match = {
                Match: { Opponent: { name: 'opponent' } },
            } as SaleWithFullMatch;
            salesDb.getOneByWithFullMatch.mockResolvedValueOnce(match);

            const query = { userId, matchDateFrom: new Date('2025-08-01') };
            const result = await usecaseDb.getOneByWithFullMatch(query);

            expect(salesDb.getOneByWithFullMatch).toHaveBeenCalledWith(query);
            expect(result).toBe(match);
        });
    });

    describe('findBySeason', () => {
        it('delegates to ISeasonPassesDbService with the same arguments', async () => {
            const passes = [{ id: 'pass-1' }] as SeasonPass[];
            seasonPassesDb.findBySeason.mockResolvedValueOnce(passes);

            const result = await usecaseDb.findBySeason(userId, 2025 as SeasonYear);

            expect(seasonPassesDb.findBySeason).toHaveBeenCalledWith(userId, 2025);
            expect(result).toBe(passes);
        });
    });

    describe('findAll', () => {
        it('delegates to ISeasonPassesDbService with the same arguments', async () => {
            const passes = [{ id: 'pass-1' }] as SeasonPass[];
            seasonPassesDb.findAll.mockResolvedValueOnce(passes);

            const result = await usecaseDb.findAll(userId);

            expect(seasonPassesDb.findAll).toHaveBeenCalledWith(userId);
            expect(result).toBe(passes);
        });
    });
});
