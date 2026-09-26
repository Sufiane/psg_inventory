import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { GetAmortizationUsecaseDb } from './get-amortization.usecase.db';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import { IAccountingDbService } from '../../../../db/accounting/accounting.db.interface';
import type { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';
import type { MatchRealizedProfit } from '../../../../db/accounting/types/match-realized-profit.type';

describe('GetAmortizationUsecaseDb', () => {
    let usecaseDb: GetAmortizationUsecaseDb;
    let seasonPassesDb: DeepMockProxy<ISeasonPassesDbService>;
    let accountingDb: DeepMockProxy<IAccountingDbService>;

    const userId = 'user-uuid' as UserId;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                GetAmortizationUsecaseDb,
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<ISeasonPassesDbService>(),
                },
                {
                    provide: IAccountingDbService,
                    useValue: mockDeep<IAccountingDbService>(),
                },
            ],
        }).compile();

        usecaseDb = module.get(GetAmortizationUsecaseDb);
        seasonPassesDb = module.get(ISeasonPassesDbService);
        accountingDb = module.get(IAccountingDbService);

        module.useLogger(false);
    });

    describe('findBySeason', () => {
        it('delegates to ISeasonPassesDbService with the same arguments', async () => {
            const passes = [{ id: 'pass-1' }] as SeasonPass[];
            seasonPassesDb.findBySeason.mockResolvedValueOnce(passes);

            const result = await usecaseDb.findBySeason(userId, 2024 as SeasonYear);

            expect(seasonPassesDb.findBySeason).toHaveBeenCalledWith(userId, 2024);
            expect(result).toBe(passes);
        });
    });

    describe('getRealizedProfitPerMatch', () => {
        it('delegates to IAccountingDbService with the same arguments', async () => {
            const rows = [{ matchId: 'm1' }] as MatchRealizedProfit[];
            accountingDb.getRealizedProfitPerMatch.mockResolvedValueOnce(rows);

            const from = new Date('2024-08-01');
            const to = new Date('2025-07-31');
            const result = await usecaseDb.getRealizedProfitPerMatch(userId, from, to);

            expect(accountingDb.getRealizedProfitPerMatch).toHaveBeenCalledWith(
                userId,
                from,
                to,
            );
            expect(result).toBe(rows);
        });
    });
});
