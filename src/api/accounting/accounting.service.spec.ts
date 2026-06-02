import { Test } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { SalesService as SalesDbService } from '../../db/sales/sales.service';
import { RedisService } from '../../redis/redis.service';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { AccountingService as AccountingDbService } from '../../db/accounting/accounting.service';
import { SaleStatus } from '@prisma/client';
import { AccountingAggregate } from '../../db/accounting/types/get-accounting.type';
import { formatAggregate } from './utils/format-aggregate.util';
import { FormattedAggregate } from './types/formatted-aggregate.type';
import { SaleWithFullMatch } from '../../db/sales/type/sale-with-full-match.type';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { Accounting } from './types/accounting.type';
import { OldestMatchSale } from '../../db/sales/type/oldest-match-sale.type';

jest.mock('../../shared/utils/season.utils');
const getCurrentSeasonDateMocked = jest.mocked(getCurrentSeasonDate);

jest.mock('./utils/format-aggregate.util');
const formatAggregateMocked = jest.mocked(formatAggregate);

describe('AccountingService', () => {
    let service: AccountingService;
    let salesDbService: DeepMockProxy<SalesDbService>;
    let accountingDbService: DeepMockProxy<AccountingDbService>;
    let redisService: DeepMockProxy<RedisService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                AccountingService,
                {
                    provide: AccountingDbService,
                    useValue: mockDeep<AccountingDbService>(),
                },
                {
                    provide: SalesDbService,
                    useValue: mockDeep<SalesDbService>(),
                },
                {
                    provide: RedisService,
                    useValue: mockDeep<RedisService>(),
                },
            ],
        }).compile();

        service = module.get(AccountingService);
        salesDbService = module.get(SalesDbService);
        accountingDbService = module.get(AccountingDbService);
        redisService = module.get(RedisService);

        module.useLogger(false);
    });

    describe('getCurrentSeason', () => {
        it('should get the current season', async () => {
            const expectedResult = {
                realized: null,
                unrealized: null,
                pending: null,
                seasonInvestment: null,
                totalSeasonInvestment: 0,
            };

            const startDate = new Date('2022-01-01');
            const endDate = new Date('2022-02-02');
            getCurrentSeasonDateMocked.mockReturnValueOnce({
                start: startDate,
                end: endDate,
            });

            const getSeasonSpy = jest.spyOn(service, 'getSeason');
            getSeasonSpy.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid';

            await expect(service.getCurrentSeason(userId)).resolves.toEqual(
                expectedResult,
            );
            expect(getSeasonSpy).toHaveBeenCalledTimes(1);
            expect(getSeasonSpy).toHaveBeenCalledWith(userId, {
                start: startDate,
                end: endDate,
            });
        });
    });

    describe('getGivenSeason', () => {
        it('should get the given season', async () => {
            const expectedResult = {
                realized: null,
                unrealized: null,
                pending: null,
                seasonInvestment: null,
                totalSeasonInvestment: 0,
            };

            const getSeasonSpy = jest.spyOn(service, 'getSeason');
            getSeasonSpy.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid';
            const seasonStartYear = 2022;

            await expect(
                service.getGivenSeason(userId, seasonStartYear),
            ).resolves.toEqual(expectedResult);
            expect(getSeasonSpy).toHaveBeenCalledTimes(1);
            expect(getSeasonSpy).toHaveBeenCalledWith(userId, {
                start: new Date(seasonStartYear, 7, 1),
                end: new Date(seasonStartYear + 1, 6, 31),
            });
        });
    });

    describe('getAllTime', () => {
        it('should get the all time accounting', async () => {
            const expectedResult = {
                realized: null,
                unrealized: null,
                pending: null,
                seasonInvestment: null,
                totalSeasonInvestment: 0,
            };

            const oldestMatchSale = {
                Match: {
                    date: new Date('2022-02-02'),
                },
            } as OldestMatchSale;
            salesDbService.getOldestMatchSale.mockResolvedValueOnce(oldestMatchSale);

            const getSeasonSpy = jest.spyOn(service, 'getSeason');
            getSeasonSpy.mockResolvedValueOnce(expectedResult);

            const userId = 'userUuid';

            await expect(service.getAllTime(userId)).resolves.toEqual(expectedResult);
            expect(getSeasonSpy).toHaveBeenCalledTimes(1);
            expect(getSeasonSpy).toHaveBeenCalledWith(userId, {
                start: oldestMatchSale.Match.date,
            });
        });
    });

    describe('getAccounting', () => {
        describe('when there is no aggregate found', () => {
            it('should return null', async () => {
                accountingDbService.getAccounting.mockResolvedValueOnce(null);

                const userId = 'userId';
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
                    _min: {
                        profit: 1,
                    },
                    _max: {
                        profit: 1,
                    },
                } as AccountingAggregate;
                accountingDbService.getAccounting.mockResolvedValueOnce(aggregate);

                const userId = 'userId';
                const status = 'realized';
                const date = {
                    start: new Date('2022-02-02'),
                    end: undefined,
                };

                const highestMatch = {
                    Match: {
                        Opponent: {
                            name: 'opponentHighest',
                        },
                    },
                } as SaleWithFullMatch;
                const lowestMatch = {
                    Match: {
                        Opponent: {
                            name: 'opponentLowest',
                        },
                    },
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

                const userId = 'userId';
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

                const userId = 'userId';
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

                const expectedResult = {
                    realized,
                    pending,
                    unrealized,
                } as TimePeriodAccounting;

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
});
