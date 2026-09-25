import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { GetSeasonAccountingUsecase } from './get-season-accounting.usecase';
import { IGetSeasonAccountingUsecaseDb } from './get-season-accounting.usecase.db';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { formatAggregate } from '../../utils/format-aggregate.util';
import { TimePeriodAccounting } from '../../types/time-period-accounting.type';
import { FormattedAggregate } from '../../types/formatted-aggregate.type';
import { AccountingAggregate } from '../../../../db/accounting/types/get-accounting.type';
import { SaleWithFullMatch } from '../../../../db/sales/type/sale-with-full-match.type';

vi.mock('../../utils/format-aggregate.util');
const formatAggregateMocked = vi.mocked(formatAggregate);

describe('GetSeasonAccountingUsecase', () => {
    let usecase: GetSeasonAccountingUsecase;
    let db: DeepMockProxy<IGetSeasonAccountingUsecaseDb>;
    let redisService: DeepMockProxy<RedisService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                GetSeasonAccountingUsecase,
                {
                    provide: IGetSeasonAccountingUsecaseDb,
                    useValue: mockDeep<IGetSeasonAccountingUsecaseDb>(),
                },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usecase = module.get(GetSeasonAccountingUsecase);
        db = module.get(IGetSeasonAccountingUsecaseDb);
        redisService = module.get(RedisService);

        module.useLogger(false);

        // RedisService.get follows a cache-aside contract: runs the loader
        // on a miss and returns its value. Default to "always miss" so
        // tests exercise the underlying logic unless they opt into a hit.
        redisService.get.mockImplementation(
            async <T>(_key: unknown, _ttl: number, loader: () => Promise<T | null>) =>
                loader(),
        );

        // Default every bucket-producing query to "nothing found"/"empty" so
        // each test only has to stub the calls it actually cares about.
        db.getAccounting.mockResolvedValue(null);
        db.getOneByWithFullMatch.mockResolvedValue({
            Match: { Opponent: { name: 'opponent' } },
        } as SaleWithFullMatch);
        db.getSoldLeadTimes.mockResolvedValue([]);
        db.findBySeason.mockResolvedValue([]);
        db.findAll.mockResolvedValue([]);
    });

    describe('execute — a single bucket (formerly the private getAccounting helper)', () => {
        // getAccounting is now a private method reached only through
        // execute(); execute() calls it once per status
        // (realized, unrealized, pending, gifted, in that order), so a test
        // that stubs only the first db.getAccounting call is exercising
        // exactly the same code path the old direct getAccounting() unit
        // tests exercised, via the realized bucket.
        describe('when there is no aggregate found', () => {
            it('leaves the realized bucket null', async () => {
                const userId = 'userId' as UserId;
                const dates: { start: Date; end?: Date } = {
                    start: new Date('2022-02-02'),
                };

                const result = await usecase.execute(userId, dates, null);

                expect(result.realized).toBeNull();
                expect(db.getAccounting).toHaveBeenNthCalledWith(
                    1,
                    userId,
                    [SaleStatus.SOLD],
                    dates.start,
                    dates.end,
                );
            });
        });

        describe('when an aggregate is found', () => {
            const aggregate = {
                _min: { profit: 1 },
                _max: { profit: 1 },
            } as AccountingAggregate;
            const userId = 'userId' as UserId;
            const lowestMatch = {
                Match: { Opponent: { name: 'opponentLowest' } },
            } as SaleWithFullMatch;
            const highestMatch = {
                Match: { Opponent: { name: 'opponentHighest' } },
            } as SaleWithFullMatch;
            const formatResult = {} as FormattedAggregate;

            beforeEach(() => {
                db.getAccounting.mockResolvedValueOnce(aggregate);
                db.getOneByWithFullMatch
                    .mockResolvedValueOnce(lowestMatch)
                    .mockResolvedValueOnce(highestMatch);
                formatAggregateMocked.mockReturnValueOnce(formatResult);
            });

            describe('when the period has no end date', () => {
                it('returns the aggregated accounting for the realized bucket', async () => {
                    const dates = { start: new Date('2022-02-02') };

                    const result = await usecase.execute(userId, dates, null);

                    expect(result.realized).toEqual(formatResult);
                    expect(db.getOneByWithFullMatch).toHaveBeenCalledTimes(2);
                    expect(db.getOneByWithFullMatch).toHaveBeenNthCalledWith(1, {
                        profit: aggregate._min.profit,
                        statuses: [SaleStatus.SOLD],
                        userId,
                        matchDateFrom: dates.start,
                    });
                    expect(db.getOneByWithFullMatch).toHaveBeenNthCalledWith(2, {
                        profit: aggregate._max.profit,
                        statuses: [SaleStatus.SOLD],
                        userId,
                        matchDateFrom: dates.start,
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

            describe('when the period has an end date', () => {
                it('includes matchDateTo in the extreme-sale lookup scope', async () => {
                    const dates = {
                        start: new Date('2026-07-01'),
                        end: new Date('2027-06-30'),
                    };

                    await usecase.execute(userId, dates, null);

                    expect(db.getOneByWithFullMatch).toHaveBeenNthCalledWith(1, {
                        profit: aggregate._min.profit,
                        statuses: [SaleStatus.SOLD],
                        userId,
                        matchDateFrom: dates.start,
                        matchDateTo: dates.end,
                    });
                    expect(db.getOneByWithFullMatch).toHaveBeenNthCalledWith(2, {
                        profit: aggregate._max.profit,
                        statuses: [SaleStatus.SOLD],
                        userId,
                        matchDateFrom: dates.start,
                        matchDateTo: dates.end,
                    });
                });
            });
        });
    });

    describe('execute — caching and the four buckets together', () => {
        describe('when there is cache', () => {
            it('should return the cache data', async () => {
                const expectedResult = {} as TimePeriodAccounting;
                redisService.get.mockResolvedValueOnce(expectedResult);

                const userId = 'userId' as UserId;
                const dates: { start: Date; end?: Date } = {
                    start: new Date('2022-02-02'),
                };

                await expect(usecase.execute(userId, dates, null)).resolves.toEqual(
                    expectedResult,
                );
                expect(redisService.get).toHaveBeenCalledTimes(1);
                expect(redisService.get).toHaveBeenCalledWith(
                    CACHE_KEYS.accounting(userId, dates.start, dates.end),
                    24 * 60 * 60,
                    expect.any(Function),
                );
            });
        });

        describe('when there is no cache', () => {
            it('should return the accounting and set the cache', async () => {
                const userId = 'userId' as UserId;
                const dates: { start: Date; end?: Date } = {
                    start: new Date('2022-02-02'),
                };
                const realized = {} as FormattedAggregate;
                const unrealized = {} as FormattedAggregate;
                const pending = {} as FormattedAggregate;
                const gifted = {} as FormattedAggregate;

                db.getAccounting.mockResolvedValue({
                    _min: {},
                    _max: {},
                } as AccountingAggregate);
                formatAggregateMocked
                    .mockReturnValueOnce(realized)
                    .mockReturnValueOnce(unrealized)
                    .mockReturnValueOnce(pending)
                    .mockReturnValueOnce(gifted);

                const expectedResult: TimePeriodAccounting = {
                    realized,
                    unrealized,
                    pending,
                    gifted,
                    seasonInvestments: [],
                    totalSeasonInvestment: 0,
                    leadTime: null,
                };

                await expect(usecase.execute(userId, dates, null)).resolves.toEqual(
                    expectedResult,
                );
                expect(redisService.get).toHaveBeenCalledTimes(1);
                expect(redisService.get).toHaveBeenCalledWith(
                    CACHE_KEYS.accounting(userId, dates.start, dates.end),
                    24 * 60 * 60,
                    expect.any(Function),
                );
            });
        });

        describe('when the period has gifted sales', () => {
            it('returns the gifted sub-bucket alongside unrealized', async () => {
                const userId = 'userId' as UserId;
                const dates = {
                    start: new Date('2025-08-01'),
                    end: new Date('2026-07-31'),
                };
                const unrealized = {} as FormattedAggregate;
                const gifted = {} as FormattedAggregate;

                db.getAccounting.mockResolvedValue({
                    _min: {},
                    _max: {},
                } as AccountingAggregate);
                formatAggregateMocked
                    .mockReturnValueOnce({} as FormattedAggregate)
                    .mockReturnValueOnce(unrealized)
                    .mockReturnValueOnce({} as FormattedAggregate)
                    .mockReturnValueOnce(gifted);

                const result = await usecase.execute(userId, dates, 2025 as SeasonYear);

                expect(result.gifted).toBe(gifted);
                expect(result.unrealized).toBe(unrealized);
            });
        });
    });

    describe('execute — lead-time aggregation', () => {
        const userId = 'userUuid' as UserId;
        const dates = { start: new Date('2024-08-01'), end: new Date('2025-07-31') };

        it('returns null leadTime when no sold sales in range', async () => {
            db.getSoldLeadTimes.mockResolvedValueOnce([]);

            const result = await usecase.execute(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime).toBeNull();
        });

        it('computes avg/median/min/max lead days from soldAt vs match date', async () => {
            // lead days: 10, 5, 1 → sorted [1, 5, 10], avg 5.33→5.3, median 5
            db.getSoldLeadTimes.mockResolvedValueOnce([
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

            const result = await usecase.execute(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime).toEqual({
                soldCount: 3,
                avgLeadDays: 5.3,
                medianLeadDays: 5,
                minLeadDays: 1,
                maxLeadDays: 10,
            });
        });

        it('clamps negative lead days to 0 (defensive against legacy backfill)', async () => {
            db.getSoldLeadTimes.mockResolvedValueOnce([
                {
                    soldAt: new Date('2024-09-15T00:00:00Z'),
                    matchDate: new Date('2024-09-10T00:00:00Z'),
                },
            ]);

            const result = await usecase.execute(userId, dates, 2024 as SeasonYear);

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
            db.getSoldLeadTimes.mockResolvedValueOnce([
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

            const result = await usecase.execute(userId, dates, 2024 as SeasonYear);

            expect(result.leadTime?.medianLeadDays).toBe(5);
        });
    });
});
