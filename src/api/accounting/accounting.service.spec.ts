import { Test } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { SalesService as SalesDbService } from '../../db/sales/sales.service';
import { RedisService } from '../../redis/redis.service';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { AccountingService as AccountingDbService } from '../../db/accounting/accounting.service';
import { SeasonPassesService as SeasonPassesDbService } from '../../db/season-passes/season-passes.service';
import { IAccountingDbService } from '../../db/accounting/accounting.db.interface';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import { SaleStatus } from '@prisma/client';
import { AccountingAggregate } from '../../db/accounting/types/get-accounting.type';
import { formatAggregate } from './utils/format-aggregate.util';
import { FormattedAggregate } from './types/formatted-aggregate.type';
import { SaleWithFullMatch } from '../../db/sales/type/sale-with-full-match.type';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { Accounting } from './types/accounting.type';
import { OldestMatchSale } from '../../db/sales/type/oldest-match-sale.type';
import { MatchRealizedProfit } from '../../db/accounting/types/match-realized-profit.type';
import { SeasonPass } from '../../db/season-passes/type/season-pass.type';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

jest.mock('../../shared/utils/season.utils');
const getCurrentSeasonDateMocked = jest.mocked(getCurrentSeasonDate);

jest.mock('./utils/format-aggregate.util');
const formatAggregateMocked = jest.mocked(formatAggregate);

describe('AccountingService', () => {
    let service: AccountingService;
    let salesDbService: DeepMockProxy<SalesDbService>;
    let accountingDbService: DeepMockProxy<AccountingDbService>;
    let seasonPassesDbService: DeepMockProxy<SeasonPassesDbService>;
    let redisService: DeepMockProxy<RedisService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                AccountingService,
                {
                    provide: IAccountingDbService,
                    useValue: mockDeep<AccountingDbService>(),
                },
                {
                    provide: ISalesDbService,
                    useValue: mockDeep<SalesDbService>(),
                },
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<SeasonPassesDbService>(),
                },
                {
                    provide: RedisService,
                    useValue: mockDeep<RedisService>(),
                },
            ],
        }).compile();

        service = module.get(AccountingService);
        salesDbService = module.get(ISalesDbService);
        accountingDbService = module.get(IAccountingDbService);
        seasonPassesDbService = module.get(ISeasonPassesDbService);
        redisService = module.get(RedisService);

        module.useLogger(false);
    });

    describe('getCurrentSeason', () => {
        it('should get the current season', async () => {
            const expectedResult = {
                realized: null,
                unrealized: null,
                pending: null,
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

            const getSeasonSpy = jest.spyOn(service, 'getSeason');
            getSeasonSpy.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid' as UserId;

            await expect(service.getCurrentSeason(userId)).resolves.toEqual(
                expectedResult,
            );
            expect(getSeasonSpy).toHaveBeenCalledTimes(1);
            expect(getSeasonSpy).toHaveBeenCalledWith(
                userId,
                { start: startDate, end: endDate },
                2021,
            );
        });
    });

    describe('getGivenSeason', () => {
        it('should get the given season', async () => {
            const expectedResult = {
                realized: null,
                unrealized: null,
                pending: null,
                seasonInvestments: [],
                totalSeasonInvestment: 0,
                leadTime: null,
            };

            const getSeasonSpy = jest.spyOn(service, 'getSeason');
            getSeasonSpy.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid' as UserId;
            const seasonStartYear = 2022 as SeasonYear;

            await expect(
                service.getGivenSeason(userId, seasonStartYear),
            ).resolves.toEqual(expectedResult);
            expect(getSeasonSpy).toHaveBeenCalledTimes(1);
            expect(getSeasonSpy).toHaveBeenCalledWith(
                userId,
                {
                    start: new Date(seasonStartYear, 7, 1),
                    end: new Date(seasonStartYear + 1, 6, 31),
                },
                seasonStartYear,
            );
        });
    });

    describe('getAllTime', () => {
        it('should get the all time accounting', async () => {
            const expectedResult = {
                realized: null,
                unrealized: null,
                pending: null,
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

            const getSeasonSpy = jest.spyOn(service, 'getSeason');
            getSeasonSpy.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid' as UserId;

            await expect(service.getAllTime(userId)).resolves.toEqual(expectedResult);
            expect(getSeasonSpy).toHaveBeenCalledTimes(1);
            expect(getSeasonSpy).toHaveBeenCalledWith(
                userId,
                { start: oldestMatchSale.Match.date },
                null,
            );
        });
    });

    describe('getAccounting', () => {
        describe('when there is no aggregate found', () => {
            it('should return null', async () => {
                accountingDbService.getAccounting.mockResolvedValueOnce(null);

                const userId = 'userId' as UserId;
                const status = 'realized';
                const date = {
                    start: new Date('2022-02-02'),
                    end: undefined,
                };

                await expect(
                    service.getAccounting(userId, status, date),
                ).resolves.toEqual(null);
                expect(accountingDbService.getAccounting).toHaveBeenCalledTimes(1);
                expect(accountingDbService.getAccounting).toHaveBeenCalledWith(
                    userId,
                    SaleStatus.SOLD,
                    date.start,
                    date.end,
                );
            });
        });

        describe('when there is an aggregate found', () => {
            it('should return the aggregated accounting', async () => {
                const aggregate = {
                    _min: { profit: 1 },
                    _max: { profit: 1 },
                } as AccountingAggregate;
                accountingDbService.getAccounting.mockResolvedValueOnce(aggregate);

                const userId = 'userId' as UserId;
                const status = 'realized';
                const date = {
                    start: new Date('2022-02-02'),
                    end: undefined,
                };

                const highestMatch = {
                    Match: { Opponent: { name: 'opponentHighest' } },
                } as SaleWithFullMatch;
                const lowestMatch = {
                    Match: { Opponent: { name: 'opponentLowest' } },
                } as SaleWithFullMatch;
                salesDbService.getOneByWithFullMatch
                    .mockResolvedValueOnce(lowestMatch)
                    .mockResolvedValueOnce(highestMatch);

                const formatResult = {} as FormattedAggregate;
                formatAggregateMocked.mockReturnValueOnce(formatResult);

                await expect(
                    service.getAccounting(userId, status, date),
                ).resolves.toEqual(formatResult);
                expect(accountingDbService.getAccounting).toHaveBeenCalledTimes(1);
                expect(accountingDbService.getAccounting).toHaveBeenCalledWith(
                    userId,
                    SaleStatus.SOLD,
                    date.start,
                    date.end,
                );
                expect(salesDbService.getOneByWithFullMatch).toHaveBeenCalledTimes(2);
                expect(salesDbService.getOneByWithFullMatch).toHaveBeenNthCalledWith(1, {
                    profit: aggregate._min.profit,
                    status: SaleStatus.SOLD,
                });
                expect(salesDbService.getOneByWithFullMatch).toHaveBeenNthCalledWith(2, {
                    profit: aggregate._max.profit,
                    status: SaleStatus.SOLD,
                });
                expect(formatAggregateMocked).toHaveBeenCalledTimes(1);
                expect(formatAggregateMocked).toHaveBeenCalledWith({
                    sum: aggregate._sum,
                    avg: aggregate._avg,
                    min: {
                        ...aggregate._min,
                        match: {
                            ...lowestMatch.Match,
                            opponent: lowestMatch.Match.Opponent.name,
                        },
                    },
                    max: {
                        ...aggregate._max,
                        match: {
                            ...highestMatch.Match,
                            opponent: highestMatch.Match.Opponent.name,
                        },
                    },
                });
            });
        });
    });

    describe('getSeason', () => {
        describe('when there is cache', () => {
            it('should return the cache data', async () => {
                const expectedResult = {} as TimePeriodAccounting;
                redisService.get.mockResolvedValueOnce({ value: expectedResult });

                const userId = 'userId' as UserId;
                const dates = {
                    start: new Date('2022-02-02'),
                    end: undefined,
                };

                await expect(service.getSeason(userId, dates, null)).resolves.toEqual(
                    expectedResult,
                );
                expect(redisService.get).toHaveBeenCalledTimes(1);
                expect(redisService.get).toHaveBeenCalledWith(
                    CACHE_KEYS.accounting(userId, dates.start, dates.end),
                );
            });
        });

        describe('when there is no cache', () => {
            it('should return the accounting and set the cache', async () => {
                redisService.get.mockResolvedValueOnce(null);
                seasonPassesDbService.findAll.mockResolvedValueOnce([]);
                accountingDbService.getSoldLeadTimes.mockResolvedValueOnce([]);

                const userId = 'userId' as UserId;
                const dates = {
                    start: new Date('2022-02-02'),
                    end: undefined,
                };

                const getAccountingSpy = jest.spyOn(service, 'getAccounting');
                const realized = {} as Accounting;
                const unrealized = {} as Accounting;
                const pending = {} as Accounting;
                getAccountingSpy
                    .mockResolvedValueOnce(realized)
                    .mockResolvedValueOnce(unrealized)
                    .mockResolvedValueOnce(pending);

                const expectedResult: TimePeriodAccounting = {
                    realized,
                    unrealized,
                    pending,
                    seasonInvestments: [],
                    totalSeasonInvestment: 0,
                    leadTime: null,
                };

                await expect(service.getSeason(userId, dates, null)).resolves.toEqual(
                    expectedResult,
                );
                expect(redisService.get).toHaveBeenCalledTimes(1);
                expect(redisService.get).toHaveBeenCalledWith(
                    CACHE_KEYS.accounting(userId, dates.start, dates.end),
                );
                expect(redisService.set).toHaveBeenCalledTimes(1);
                expect(redisService.set).toHaveBeenCalledWith(
                    CACHE_KEYS.accounting(userId, dates.start, dates.end),
                    expectedResult,
                    24 * 60 * 60,
                );
            });
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

        beforeEach(() => {
            redisService.get.mockResolvedValue(null);
        });

        it('returns zeroed result when no sales and no pass', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.hasPass).toBe(false);
            expect(result.passPrice).toBe(0);
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
                row({
                    matchId: 'm2' as MatchId,
                    date: new Date('2024-10-01'),
                    matchProfit: 300,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.hasPass).toBe(true);
            expect(result.passPrice).toBe(1000);
            expect(result.totalRealized).toBe(500);
            expect(result.progress).toBeCloseTo(0.5);
            expect(result.remaining).toBe(500);
            expect(result.surplus).toBe(0);
            expect(result.breakEven).toBeNull();
            expect(result.perMatch[1].cumulative).toBe(500);
        });

        it('flags the first match whose cumulative crosses pass price', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(500)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 200,
                }),
                row({
                    matchId: 'm2' as MatchId,
                    date: new Date('2024-10-01'),
                    matchProfit: 400,
                    opponent: 'Lyon',
                }),
                row({
                    matchId: 'm3' as MatchId,
                    date: new Date('2024-11-01'),
                    matchProfit: 100,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.progress).toBe(1);
            expect(result.remaining).toBe(0);
            expect(result.surplus).toBe(200);
            expect(result.breakEven).toEqual({
                matchId: 'm2' as MatchId,
                date: new Date('2024-10-01'),
                opponent: 'Lyon',
                cumulative: 600,
            });
            expect(result.perMatch.filter((entry) => entry.isBreakEven)).toHaveLength(1);
        });

        it('caps progress at 1 and reports surplus on overshoot', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(300)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 800,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.progress).toBe(1);
            expect(result.remaining).toBe(0);
            expect(result.surplus).toBe(500);
        });

        it('treats missing pass as no progress; surplus tracks total realized', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 150,
                }),
            ]);

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result.hasPass).toBe(false);
            expect(result.progress).toBe(0);
            expect(result.remaining).toBe(0);
            expect(result.surplus).toBe(150);
            expect(result.breakEven).toBeNull();
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
            redisService.get.mockResolvedValueOnce({ value: cachedValue });

            const result = await service.getAmortization(userId, seasonStartYear);

            expect(result).toEqual(cachedValue);
            expect(accountingDbService.getRealizedProfitPerMatch).not.toHaveBeenCalled();
            expect(seasonPassesDbService.findBySeason).not.toHaveBeenCalled();
        });

        it('writes the computed result to cache', async () => {
            seasonPassesDbService.findBySeason.mockResolvedValueOnce([pass(100)]);
            accountingDbService.getRealizedProfitPerMatch.mockResolvedValueOnce([
                row({
                    matchId: 'm1' as MatchId,
                    date: new Date('2024-09-01'),
                    matchProfit: 100,
                }),
            ]);

            await service.getAmortization(userId, seasonStartYear);

            expect(redisService.set).toHaveBeenCalledTimes(1);
            const [key, value, ttl] = redisService.set.mock.calls[0];
            expect(key).toBe(CACHE_KEYS.amortization(userId, seasonStartYear));
            expect(ttl).toBe(24 * 60 * 60);
            expect((value as { progress: number }).progress).toBe(1);
        });
    });

    describe('getSeason — lead-time aggregation', () => {
        const userId = 'userUuid' as UserId;
        const dates = { start: new Date('2024-08-01'), end: new Date('2025-07-31') };

        beforeEach(() => {
            redisService.get.mockResolvedValue(null);
            seasonPassesDbService.findBySeason.mockResolvedValue([]);
            seasonPassesDbService.findAll.mockResolvedValue([]);
            jest.spyOn(service, 'getAccounting').mockResolvedValue(null);
        });

        it('returns null leadTime when no sold sales in range', async () => {
            accountingDbService.getSoldLeadTimes.mockResolvedValueOnce([]);

            const result = await service.getSeason(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime).toBeNull();
        });

        it('computes avg/median/min/max lead days from soldAt vs match date', async () => {
            // lead days: 10, 5, 1 → sorted [1, 5, 10], avg 5.33→5.3, median 5
            accountingDbService.getSoldLeadTimes.mockResolvedValueOnce([
                {
                    soldAt: new Date('2024-09-01T00:00:00Z'),
                    matchDate: new Date('2024-09-11T00:00:00Z'),
                },
                {
                    soldAt: new Date('2024-10-01T00:00:00Z'),
                    matchDate: new Date('2024-10-06T00:00:00Z'),
                },
                {
                    soldAt: new Date('2024-11-01T00:00:00Z'),
                    matchDate: new Date('2024-11-02T00:00:00Z'),
                },
            ]);

            const result = await service.getSeason(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime).toEqual({
                soldCount: 3,
                avgLeadDays: 5.3,
                medianLeadDays: 5,
                minLeadDays: 1,
                maxLeadDays: 10,
            });
        });

        it('clamps negative lead days to 0 (defensive against legacy backfill)', async () => {
            accountingDbService.getSoldLeadTimes.mockResolvedValueOnce([
                {
                    soldAt: new Date('2024-09-15T00:00:00Z'),
                    matchDate: new Date('2024-09-10T00:00:00Z'),
                },
            ]);

            const result = await service.getSeason(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime).toEqual({
                soldCount: 1,
                avgLeadDays: 0,
                medianLeadDays: 0,
                minLeadDays: 0,
                maxLeadDays: 0,
            });
        });

        it('averages the two middle values for an even-length sample', async () => {
            // 2, 4, 6, 10 → median = (4+6)/2 = 5
            accountingDbService.getSoldLeadTimes.mockResolvedValueOnce([
                {
                    soldAt: new Date('2024-09-01T00:00:00Z'),
                    matchDate: new Date('2024-09-03T00:00:00Z'),
                },
                {
                    soldAt: new Date('2024-10-01T00:00:00Z'),
                    matchDate: new Date('2024-10-05T00:00:00Z'),
                },
                {
                    soldAt: new Date('2024-11-01T00:00:00Z'),
                    matchDate: new Date('2024-11-07T00:00:00Z'),
                },
                {
                    soldAt: new Date('2024-12-01T00:00:00Z'),
                    matchDate: new Date('2024-12-11T00:00:00Z'),
                },
            ]);

            const result = await service.getSeason(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime?.medianLeadDays).toBe(5);
        });
    });
});
