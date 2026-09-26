import { Test } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { SalesDb } from '../../db/sales/sales.db';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import { Amortization } from './types/amortization.type';
import { OldestMatchSale } from '../../db/sales/type/oldest-match-sale.type';
import { IGetSeasonAccountingUsecase } from './usecases/get-season-accounting/get-season-accounting.usecase';
import { IGetAmortizationUsecase } from './usecases/get-amortization/get-amortization.usecase';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

// Only getCurrentSeasonDate needs mocking (to control "now") — seasonStartYearFromDate
// and getSeasonWindow must stay real so getGivenSeason/getCurrentSeason assertions
// exercise the actual UTC boundary math.
const seasonUtilsRef = vi.hoisted(() => ({
    value: null as null | typeof import('../../shared/utils/season.utils'),
}));

vi.mock('../../shared/utils/season.utils', async (importOriginal) => {
    seasonUtilsRef.value = await importOriginal();
    return {
        ...seasonUtilsRef.value,
        getCurrentSeasonDate: vi.fn(),
    };
});
const getCurrentSeasonDateMocked = vi.mocked(getCurrentSeasonDate);

describe('AccountingService', () => {
    let service: AccountingService;
    let salesDbService: DeepMockProxy<SalesDb>;
    let getSeasonAccountingUsecase: DeepMockProxy<IGetSeasonAccountingUsecase>;
    let getAmortizationUsecase: DeepMockProxy<IGetAmortizationUsecase>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                AccountingService,
                {
                    provide: ISalesDbService,
                    useValue: mockDeep<SalesDb>(),
                },
                {
                    provide: IGetSeasonAccountingUsecase,
                    useValue: mockDeep<IGetSeasonAccountingUsecase>(),
                },
                {
                    provide: IGetAmortizationUsecase,
                    useValue: mockDeep<IGetAmortizationUsecase>(),
                },
            ],
        }).compile();

        service = module.get(AccountingService);
        salesDbService = module.get(ISalesDbService);
        getSeasonAccountingUsecase = module.get(IGetSeasonAccountingUsecase);
        getAmortizationUsecase = module.get(IGetAmortizationUsecase);

        module.useLogger(false);
    });

    describe('getCurrentSeason', () => {
        it('should get the current season', async () => {
            const expectedResult: TimePeriodAccounting = {
                realized: null,
                unrealized: null,
                pending: null,
                gifted: null,
                seasonInvestments: [],
                totalSeasonInvestment: 0,
                leadTime: null,
            };

            const startDate = new Date(2022, 0, 1);
            const endDate = new Date(2022, 1, 2);
            getCurrentSeasonDateMocked.mockReturnValueOnce({
                start: startDate,
                end: endDate,
            });

            getSeasonAccountingUsecase.execute.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid' as UserId;

            await expect(service.getCurrentSeason(userId)).resolves.toEqual(
                expectedResult,
            );
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledTimes(1);
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledWith(
                userId,
                { start: startDate, end: endDate },
                2021,
            );
        });
    });

    describe('getGivenSeason', () => {
        it('should get the given season', async () => {
            const expectedResult: TimePeriodAccounting = {
                realized: null,
                unrealized: null,
                pending: null,
                gifted: null,
                seasonInvestments: [],
                totalSeasonInvestment: 0,
                leadTime: null,
            };

            getSeasonAccountingUsecase.execute.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid' as UserId;
            const seasonStartYear = 2022 as SeasonYear;

            await expect(
                service.getGivenSeason(userId, seasonStartYear),
            ).resolves.toEqual(expectedResult);
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledTimes(1);
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledWith(
                userId,
                {
                    start: new Date(Date.UTC(seasonStartYear, 7, 1)),
                    end: new Date(Date.UTC(seasonStartYear + 1, 6, 31)),
                },
                seasonStartYear,
            );
        });
    });

    describe('getAllTime', () => {
        it('should get the all time accounting', async () => {
            const expectedResult: TimePeriodAccounting = {
                realized: null,
                unrealized: null,
                pending: null,
                gifted: null,
                seasonInvestments: [],
                totalSeasonInvestment: 0,
                leadTime: null,
            };

            const oldestMatchSale = {
                Match: {
                    date: new Date('2022-02-02'),
                },
            } as OldestMatchSale;
            salesDbService.getOldestMatchSale.mockResolvedValueOnce(oldestMatchSale);

            getSeasonAccountingUsecase.execute.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid' as UserId;

            await expect(service.getAllTime(userId)).resolves.toEqual(expectedResult);
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledTimes(1);
            expect(getSeasonAccountingUsecase.execute).toHaveBeenCalledWith(
                userId,
                { start: oldestMatchSale.Match.date },
                null,
            );
        });
    });

    describe('getAmortization', () => {
        it('delegates to IGetAmortizationUsecase with the same arguments', async () => {
            const expectedResult = {} as Amortization;
            const userId = 'userUuid' as UserId;
            const seasonStartYear = 2024 as SeasonYear;
            getAmortizationUsecase.execute.mockResolvedValueOnce(expectedResult);

            await expect(
                service.getAmortization(userId, seasonStartYear),
            ).resolves.toEqual(expectedResult);
            expect(getAmortizationUsecase.execute).toHaveBeenCalledTimes(1);
            expect(getAmortizationUsecase.execute).toHaveBeenCalledWith(
                userId,
                seasonStartYear,
            );
        });
    });
});
