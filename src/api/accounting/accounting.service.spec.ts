import { Test } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { SalesDb } from '../../db/sales/sales.db';
import { RedisService } from '../../redis/redis.service';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { AccountingDb } from '../../db/accounting/accounting.db';
import { SeasonPassesDb } from '../../db/season-passes/season-passes.db';
import { IAccountingDbService } from '../../db/accounting/accounting.db.interface';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { OldestMatchSale } from '../../db/sales/type/oldest-match-sale.type';
import { MatchRealizedProfit } from '../../db/accounting/types/match-realized-profit.type';
import { SeasonPass } from '../../db/season-passes/type/season-pass.type';
import { IGetSeasonAccountingUsecase } from './usecases/get-season-accounting/get-season-accounting.usecase';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
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
    let accountingDbService: DeepMockProxy<AccountingDb>;
    let seasonPassesDbService: DeepMockProxy<SeasonPassesDb>;
    let redisService: DeepMockProxy<RedisService>;
    let getSeasonAccountingUsecase: DeepMockProxy<IGetSeasonAccountingUsecase>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                AccountingService,
                {
                    provide: IAccountingDbService,
                    useValue: mockDeep<AccountingDb>(),
                },
                {
                    provide: ISalesDbService,
                    useValue: mockDeep<SalesDb>(),
                },
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<SeasonPassesDb>(),
                },
                {
                    provide: RedisService,
                    useValue: mockDeep<RedisService>(),
                },
                {
                    provide: IGetSeasonAccountingUsecase,
                    useValue: mockDeep<IGetSeasonAccountingUsecase>(),
                },
            ],
        }).compile();

        service = module.get(AccountingService);
        salesDbService = module.get(ISalesDbService);
        accountingDbService = module.get(IAccountingDbService);
        seasonPassesDbService = module.get(ISeasonPassesDbService);
        redisService = module.get(RedisService);
        getSeasonAccountingUsecase = module.get(IGetSeasonAccountingUsecase);

        module.useLogger(false);

        // RedisService.get now follows a cache-aside contract: it runs the
        // loader on a miss and returns its value. Default to "always miss"
        // so tests exercise the underlying logic unless they opt into a hit.
        redisService.get.mockImplementation(
            async <T>(_key: unknown, _ttl: number, loader: () => Promise<T | null>) =>
                loader(),
        );
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

            // start month=0 < 7 → seasonStartYear = 2021
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
        const userId = 'userUuid' as UserId;
        const seasonStartYear = 2024 as SeasonYear;

        function row(
            overrides: Partial<MatchRealizedProfit> & {
                matchId: MatchId;
                date: Date;
                matchProfit: number;
            },
        ): MatchRealizedProfit {
            return {
                opponent: 'Marseille',
                competition: 'CHAMPIONSHIP',
                atHome: true,
                ...overrides,
            };
        }

        function pass(price: number): SeasonPass {
            return {
                id: 'pass-id' as SeasonPassId,
                userId,
                seasonStartYear,
                price,
                label: 'Pass',
                category: '-',
                row: '-',
                seat: '-',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }

        it('returns zeroed result when no sales and no pass', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.passPrice).toBe(0);
            expect(result.hasPass).toBe(false);
            expect(result.totalRealized).toBe(0);
            expect(result.progress).toBe(0);
            expect(result.remaining).toBe(0);
            expect(result.surplus).toBe(0);
            expect(result.breakEven).toBeNull();
            expect(result.perMatch).toEqual([]);
        });

        it('reports progress without break-even when below pass price', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(1000)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 200,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.hasPass).toBe(true);
            expect(result.passPrice).toBe(1000);
            expect(result.totalRealized).toBe(200);
            expect(result.progress).toBe(0.2);
            expect(result.remaining).toBe(800);
            expect(result.surplus).toBe(0);
            expect(result.breakEven).toBeNull();
        });

        it('flags the first match whose cumulative crosses pass price', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(300)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 200,
                }),
                row({
                    matchId: 'm2' as MatchId,
                    date: new Date('2024-09-15'),
                    matchProfit: 150,
                }),
                row({
                    matchId: 'm3' as MatchId,
                    date: new Date('2024-09-29'),
                    matchProfit: 50,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.totalRealized).toBe(400);
            expect(result.progress).toBe(1);
            expect(result.remaining).toBe(0);
            expect(result.surplus).toBe(100);
            expect(result.breakEven).toMatchObject({ matchId: 'm2' });
            expect(result.perMatch[0]?.isBreakEven).toBe(false);
            expect(result.perMatch[1]?.isBreakEven).toBe(true);
            expect(result.perMatch[2]?.isBreakEven).toBe(false);
        });

        it('caps progress at 1 and reports surplus on overshoot', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(100)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 500,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.progress).toBe(1);
            expect(result.surplus).toBe(400);
        });

        it('treats missing pass as no progress; surplus tracks total realized', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 300,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.hasPass).toBe(false);
            expect(result.progress).toBe(0);
            expect(result.remaining).toBe(0);
            expect(result.surplus).toBe(300);
        });

        it('reads from cache when present', async () => {
            const cachedValue = {
                seasonStartYear,
                passPrice: 1000,
                hasPass: true,
                totalRealized: 1000,
                progress: 1,
                remaining: 0,
                surplus: 0,
                breakEven: null,
                perMatch: [],
            };
            redisService.get.mockReset();
            redisService.get.mockResolvedValueOnce(cachedValue);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result).toEqual(cachedValue);
            expect(accountingDbService.getRealizedProfitPerMatch).not.toHaveBeenCalled();
            expect(seasonPassesDbService.findBySeason).not.toHaveBeenCalled();
        });

        it('delegates caching to redis with the right key and ttl', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(100)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 100,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(redisService.get).toHaveBeenCalledTimes(1);
            expect(redisService.get).toHaveBeenCalledWith(
                CACHE_KEYS.amortization(userId, seasonStartYear),
                24 * 60 * 60,
                expect.any(Function),
            );
            expect(result.progress).toBe(1);
        });
    });
});
