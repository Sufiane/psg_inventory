import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { CommitSalesImportUsecaseDb } from './commit-sales-import.usecase.db';
import { IMatchesDbService } from '../../../../db/matches/matches.db.interface';
import { ISalesImportDbService } from '../../../../db/sales-import/sales-import.db.interface';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import type { Match } from '../../../../db/matches/types/match.type';

describe('CommitSalesImportUsecaseDb', () => {
    let usecaseDb: CommitSalesImportUsecaseDb;
    let matchesDb: DeepMockProxy<IMatchesDbService>;
    let salesImportDb: DeepMockProxy<ISalesImportDbService>;

    const userId = 'user-uuid' as UserId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                CommitSalesImportUsecaseDb,
                { provide: IMatchesDbService, useValue: mockDeep<IMatchesDbService>() },
                {
                    provide: ISalesImportDbService,
                    useValue: mockDeep<ISalesImportDbService>(),
                },
            ],
        }).compile();

        usecaseDb = module.get(CommitSalesImportUsecaseDb);
        matchesDb = module.get(IMatchesDbService);
        salesImportDb = module.get(ISalesImportDbService);

        module.useLogger(false);
    });

    describe('getHomeMatchesForSeason', () => {
        it('delegates to IMatchesDbService with the season year', async () => {
            const matches = [{ id: 'match-1', date: new Date('2025-09-14') }] as Match[];
            matchesDb.getHomeMatchesForSeason.mockResolvedValue(matches);

            const result = await usecaseDb.getHomeMatchesForSeason(2025 as SeasonYear);

            expect(matchesDb.getHomeMatchesForSeason).toHaveBeenCalledWith(
                2025 as SeasonYear,
            );
            expect(result).toEqual(matches);
        });
    });

    describe('bulkCreate', () => {
        it('forwards userId, batchId and sales unchanged', async () => {
            salesImportDb.bulkCreate.mockResolvedValue(3);

            const payload = { userId, batchId: 'batch-1', sales: [] };
            const result = await usecaseDb.bulkCreate(payload);

            expect(salesImportDb.bulkCreate).toHaveBeenCalledWith(payload);
            expect(result).toBe(3);
        });

        it('does not expose deleteBatch (the revert-only query is unreachable here)', async () => {
            expect(usecaseDb).not.toHaveProperty('deleteBatch');
        });
    });
});
