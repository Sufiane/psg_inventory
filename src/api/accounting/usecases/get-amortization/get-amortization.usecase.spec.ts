import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonPassPrice } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';

import { GetAmortizationUsecase } from './get-amortization.usecase';
import { IGetAmortizationUsecaseDb } from './get-amortization.usecase.db';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import type { MatchRealizedProfit } from '../../../../db/accounting/types/match-realized-profit.type';
import type { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';

describe('GetAmortizationUsecase', () => {
    let usecase: GetAmortizationUsecase;
    let db: DeepMockProxy<IGetAmortizationUsecaseDb>;
    let redisService: DeepMockProxy<RedisService>;

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
            price: price as SeasonPassPrice,
            label: 'Pass',
            category: '-',
            row: '-',
            seat: '-',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                GetAmortizationUsecase,
                {
                    provide: IGetAmortizationUsecaseDb,
                    useValue: mockDeep<IGetAmortizationUsecaseDb>(),
                },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usecase = module.get(GetAmortizationUsecase);
        db = module.get(IGetAmortizationUsecaseDb);
        redisService = module.get(RedisService);

        module.useLogger(false);

        redisService.get.mockImplementation(
            async <T>(_key: unknown, _ttl: number, loader: () => Promise<T | null>) =>
                loader(),
        );
    });

    describe('execute', () => {
        describe('when there are no sales and no pass', () => {
            it('returns a zeroed result', async () => {
                db.findBySeason.mockResolvedValueOnce([]);
                db.getRealizedProfitPerMatch.mockResolvedValueOnce([]);

                const result = await usecase.execute(userId, seasonStartYear);

                expect(result.passPrice).toBe(0);
                expect(result.hasPass).toBe(false);
                expect(result.totalRealized).toBe(0);
                expect(result.progress).toBe(0);
                expect(result.remaining).toBe(0);
                expect(result.surplus).toBe(0);
                expect(result.breakEven).toBeNull();
                expect(result.perMatch).toEqual([]);
            });
        });

        describe('when realized profit is below the pass price', () => {
            it('reports progress without a break-even match', async () => {
                db.findBySeason.mockResolvedValueOnce([pass(1000)]);
                db.getRealizedProfitPerMatch.mockResolvedValueOnce([
                    row({
                        matchId: 'm1' as MatchId,
                        date: new Date('2024-09-01'),
                        matchProfit: 200,
                    }),
                ]);

                const result = await usecase.execute(userId, seasonStartYear);

                expect(result.hasPass).toBe(true);
                expect(result.passPrice).toBe(1000);
                expect(result.totalRealized).toBe(200);
                expect(result.progress).toBe(0.2);
                expect(result.remaining).toBe(800);
                expect(result.surplus).toBe(0);
                expect(result.breakEven).toBeNull();
            });
        });

        describe('when cumulative profit crosses the pass price', () => {
            it('flags the first match at or past the crossing', async () => {
                db.findBySeason.mockResolvedValueOnce([pass(300)]);
                db.getRealizedProfitPerMatch.mockResolvedValueOnce([
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

                const result = await usecase.execute(userId, seasonStartYear);

                expect(result.totalRealized).toBe(400);
                expect(result.progress).toBe(1);
                expect(result.remaining).toBe(0);
                expect(result.surplus).toBe(100);
                expect(result.breakEven).toMatchObject({ matchId: 'm2' });
                expect(result.perMatch[0]?.isBreakEven).toBe(false);
                expect(result.perMatch[1]?.isBreakEven).toBe(true);
                expect(result.perMatch[2]?.isBreakEven).toBe(false);
            });
        });

        describe('when realized profit overshoots the pass price', () => {
            it('caps progress at 1 and reports the surplus', async () => {
                db.findBySeason.mockResolvedValueOnce([pass(100)]);
                db.getRealizedProfitPerMatch.mockResolvedValueOnce([
                    row({
                        matchId: 'm1' as MatchId,
                        date: new Date('2024-09-01'),
                        matchProfit: 500,
                    }),
                ]);

                const result = await usecase.execute(userId, seasonStartYear);

                expect(result.progress).toBe(1);
                expect(result.surplus).toBe(400);
            });
        });

        describe('when there is no pass', () => {
            it('treats it as no progress while surplus still tracks total realized', async () => {
                db.findBySeason.mockResolvedValueOnce([]);
                db.getRealizedProfitPerMatch.mockResolvedValueOnce([
                    row({
                        matchId: 'm1' as MatchId,
                        date: new Date('2024-09-01'),
                        matchProfit: 300,
                    }),
                ]);

                const result = await usecase.execute(userId, seasonStartYear);

                expect(result.hasPass).toBe(false);
                expect(result.progress).toBe(0);
                expect(result.remaining).toBe(0);
                expect(result.surplus).toBe(300);
            });
        });

        describe('when a cached value is present', () => {
            it('returns the cached value without hitting the db', async () => {
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
                    passes: [],
                };
                redisService.get.mockReset();
                redisService.get.mockResolvedValueOnce(cachedValue);

                const result = await usecase.execute(userId, seasonStartYear);

                expect(result).toEqual(cachedValue);
                expect(db.getRealizedProfitPerMatch).not.toHaveBeenCalled();
                expect(db.findBySeason).not.toHaveBeenCalled();
            });
        });

        describe('when computing a fresh result', () => {
            it('delegates caching to redis with the right key and ttl', async () => {
                db.findBySeason.mockResolvedValueOnce([pass(100)]);
                db.getRealizedProfitPerMatch.mockResolvedValueOnce([
                    row({
                        matchId: 'm1' as MatchId,
                        date: new Date('2024-09-01'),
                        matchProfit: 100,
                    }),
                ]);

                const result = await usecase.execute(userId, seasonStartYear);

                expect(redisService.get).toHaveBeenCalledTimes(1);
                expect(redisService.get).toHaveBeenCalledWith(
                    CACHE_KEYS.amortization(userId, seasonStartYear),
                    24 * 60 * 60,
                    expect.any(Function),
                );
                expect(result.progress).toBe(1);
            });
        });

        describe('when redis returns a nullish value', () => {
            it('falls back to emptyAmortization', async () => {
                db.findBySeason.mockResolvedValueOnce([]);
                db.getRealizedProfitPerMatch.mockResolvedValueOnce([]);
                redisService.get.mockResolvedValueOnce(null);

                const result = await usecase.execute(userId, seasonStartYear);

                expect(result).toEqual({
                    seasonStartYear,
                    passPrice: 0,
                    hasPass: false,
                    totalRealized: 0,
                    progress: 0,
                    remaining: 0,
                    surplus: 0,
                    breakEven: null,
                    perMatch: [],
                    passes: [],
                });
            });
        });
    });
});
