import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Mock, MockInstance } from 'vitest';
import { Prisma } from '@prisma/client';
import { MatchesDb } from './matches.db';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { FormattedMatch } from '../../shared/types/formatted-match.type';
import type { MatchId, UserId } from '@psg/shared/ids';
import type { OpponentName } from '@psg/shared/strings';

describe('MatchesDb', () => {
    let service: MatchesDb;
    let prismaService: DeepMockProxy<PrismaService>;
    let redisService: DeepMockProxy<RedisService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                MatchesDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        service = module.get(MatchesDb);
        prismaService = module.get(PrismaService);
        redisService = module.get(RedisService);
    });

    describe('loadMatches', () => {
        const formattedMatch: FormattedMatch = {
            competition: 'Ligue 1',
            date: '2026-09-13T19:00:00.000Z',
            atHome: true,
            opponent: 'Marseille' as OpponentName,
        };

        beforeEach(() => {
            prismaService.sales.findMany.mockResolvedValue([] as never);
        });

        function mockTransaction(existingMatchId: string | null): void {
            const tx = mockDeep<Prisma.TransactionClient>();

            tx.opponents.upsert.mockResolvedValue({ id: 'opponent-id' } as never);
            tx.matches.findFirst.mockResolvedValue(
                existingMatchId ? ({ id: existingMatchId } as never) : null,
            );

            (prismaService.$transaction as Mock).mockImplementation(
                (callback: (tx: Prisma.TransactionClient) => unknown) => callback(tx),
            );
        }

        describe('when the match already exists', () => {
            beforeEach(() => {
                mockTransaction('existing-match-id');
            });

            it('directly invalidates both per-match cache key variants for the updated match', async () => {
                await service.loadMatches([formattedMatch]);

                expect(redisService.invalidate).toHaveBeenCalledWith(
                    CACHE_KEYS.match('existing-match-id' as MatchId, true),
                );
                expect(redisService.invalidate).toHaveBeenCalledWith(
                    CACHE_KEYS.match('existing-match-id' as MatchId, false),
                );
            });

            it('does not run a full-keyspace pattern scan per updated match', async () => {
                await service.loadMatches([formattedMatch]);

                // Only the one namespace-wide flush below — no per-match
                // invalidatePattern call, which is what used to force an
                // extra full-keyspace SCAN per updated match. Holds when the
                // updated match has no sales.
                expect(redisService.invalidatePattern).toHaveBeenCalledTimes(1);
            });

            it('still invalidates the matches namespace', async () => {
                await service.loadMatches([formattedMatch]);

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateMatches(),
                );
            });
        });

        describe('when the match is newly created', () => {
            beforeEach(() => {
                mockTransaction(null);
            });

            it('does not invalidate any per-match cache key', async () => {
                await service.loadMatches([formattedMatch]);

                expect(redisService.invalidate).not.toHaveBeenCalled();
            });

            it('still invalidates the matches namespace', async () => {
                await service.loadMatches([formattedMatch]);

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateMatches(),
                );
            });
        });

        describe('when updated matches have sales owned by several users', () => {
            const firstUser = 'user-1' as UserId;
            const secondUser = 'user-2' as UserId;

            beforeEach(() => {
                mockTransaction('existing-match-id');
                prismaService.sales.findMany.mockResolvedValue([
                    { userId: firstUser },
                    { userId: secondUser },
                ] as never);
            });

            it('looks up distinct owners of the updated matches', async () => {
                await service.loadMatches([formattedMatch]);

                expect(prismaService.sales.findMany).toHaveBeenCalledWith({
                    where: { matchId: { in: ['existing-match-id'] } },
                    select: { userId: true },
                    distinct: ['userId'],
                });
            });

            it('invalidates the sales cache of each owner', async () => {
                await service.loadMatches([formattedMatch]);

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateSales(firstUser),
                );
                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateSales(secondUser),
                );
            });

            it('invalidates the accounting cache of each owner', async () => {
                await service.loadMatches([formattedMatch]);

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateAccounting(firstUser),
                );
                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateAccounting(secondUser),
                );
            });

            it('flushes the matches namespace once plus two patterns per owner', async () => {
                await service.loadMatches([formattedMatch]);

                expect(redisService.invalidatePattern).toHaveBeenCalledTimes(5);
            });
        });

        describe('when the per-match cache deletes fail', () => {
            beforeEach(() => {
                mockTransaction('existing-match-id');
                prismaService.sales.findMany.mockResolvedValue([
                    { userId: 'user-1' },
                ] as never);
                redisService.invalidate.mockRejectedValue(new Error('redis down'));
            });

            it('still invalidates the owners sales cache before them', async () => {
                await expect(service.loadMatches([formattedMatch])).rejects.toThrow(
                    'redis down',
                );

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateSales('user-1' as UserId),
                );
            });
        });

        describe('when no match was updated', () => {
            beforeEach(() => {
                mockTransaction(null);
            });

            it('does not query sales', async () => {
                await service.loadMatches([formattedMatch]);

                expect(prismaService.sales.findMany).not.toHaveBeenCalled();
            });
        });

        describe('when updated matches have no sales', () => {
            beforeEach(() => {
                mockTransaction('existing-match-id');
                prismaService.sales.findMany.mockResolvedValue([] as never);
            });

            it('invalidates no per-user cache', async () => {
                await service.loadMatches([formattedMatch]);

                expect(redisService.invalidatePattern).toHaveBeenCalledTimes(1);
            });
        });

        describe('when the sales lookup throws', () => {
            let errorSpy: MockInstance;

            beforeEach(() => {
                errorSpy = vi
                    .spyOn(Logger.prototype, 'error')
                    .mockImplementation(() => undefined);
                prismaService.sales.findMany.mockRejectedValue(
                    new Error('lookup failed'),
                );
            });

            afterEach(() => {
                errorSpy.mockRestore();
            });

            describe('and the sync already failed', () => {
                beforeEach(() => {
                    const tx = mockDeep<Prisma.TransactionClient>();

                    tx.opponents.upsert.mockResolvedValue({ id: 'opponent-id' } as never);
                    tx.matches.findFirst.mockResolvedValue({
                        id: 'first-match-id',
                    } as never);

                    let callCount = 0;

                    (prismaService.$transaction as Mock).mockImplementation(
                        (callback: (tx: Prisma.TransactionClient) => unknown) => {
                            callCount += 1;

                            if (callCount === 2) {
                                return Promise.reject(new Error('db exploded'));
                            }

                            return callback(tx);
                        },
                    );
                });

                it('propagates the sync error, not the lookup error', async () => {
                    await expect(
                        service.loadMatches([formattedMatch, formattedMatch]),
                    ).rejects.toThrow('db exploded');
                });

                it('logs the lookup error', async () => {
                    await expect(
                        service.loadMatches([formattedMatch, formattedMatch]),
                    ).rejects.toThrow('db exploded');

                    expect(errorSpy).toHaveBeenCalledTimes(1);
                });
            });

            describe('and the sync succeeded', () => {
                beforeEach(() => {
                    mockTransaction('existing-match-id');
                });

                it('propagates the lookup error', async () => {
                    await expect(service.loadMatches([formattedMatch])).rejects.toThrow(
                        'lookup failed',
                    );
                });
            });
        });

        describe('when a mid-loop transaction throws after earlier matches already committed', () => {
            const firstMatch: FormattedMatch = {
                ...formattedMatch,
                opponent: 'Marseille' as OpponentName,
            };
            const secondMatch: FormattedMatch = {
                ...formattedMatch,
                opponent: 'Lyon' as OpponentName,
            };

            beforeEach(() => {
                const tx = mockDeep<Prisma.TransactionClient>();

                tx.opponents.upsert.mockResolvedValue({ id: 'opponent-id' } as never);
                tx.matches.findFirst.mockResolvedValue({
                    id: 'first-match-id',
                } as never);

                let callCount = 0;

                (prismaService.$transaction as Mock).mockImplementation(
                    (callback: (tx: Prisma.TransactionClient) => unknown) => {
                        callCount += 1;

                        if (callCount === 2) {
                            return Promise.reject(new Error('db exploded'));
                        }

                        return callback(tx);
                    },
                );
            });

            it('still invalidates the cache for matches that committed before the throw', async () => {
                await expect(
                    service.loadMatches([firstMatch, secondMatch]),
                ).rejects.toThrow('db exploded');

                expect(redisService.invalidate).toHaveBeenCalledWith(
                    CACHE_KEYS.match('first-match-id' as MatchId, true),
                );
                expect(redisService.invalidate).toHaveBeenCalledWith(
                    CACHE_KEYS.match('first-match-id' as MatchId, false),
                );
            });

            it('still flushes the matches namespace', async () => {
                await expect(
                    service.loadMatches([firstMatch, secondMatch]),
                ).rejects.toThrow('db exploded');

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateMatches(),
                );
            });

            describe('and the committed match has sales', () => {
                beforeEach(() => {
                    prismaService.sales.findMany.mockResolvedValue([
                        { userId: 'user-1' },
                    ] as never);
                });

                it('still invalidates sales and accounting caches of its owners', async () => {
                    await expect(
                        service.loadMatches([firstMatch, secondMatch]),
                    ).rejects.toThrow('db exploded');

                    expect(prismaService.sales.findMany).toHaveBeenCalledWith({
                        where: { matchId: { in: ['first-match-id'] } },
                        select: { userId: true },
                        distinct: ['userId'],
                    });
                    expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                        CACHE_KEYS.invalidateSales('user-1' as UserId),
                    );
                    expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                        CACHE_KEYS.invalidateAccounting('user-1' as UserId),
                    );
                });
            });

            it('propagates the transaction error to the caller', async () => {
                await expect(
                    service.loadMatches([firstMatch, secondMatch]),
                ).rejects.toThrow('db exploded');
            });
        });

        describe('when a match has an unknown competition', () => {
            const unknownMatch: FormattedMatch = {
                ...formattedMatch,
                competition: 'Trophée des Champions',
            };

            it('skips the match without opening a transaction and reports the competition', async () => {
                const result = await service.loadMatches([unknownMatch]);

                expect(prismaService.$transaction).not.toHaveBeenCalled();
                expect(result.unknownCompetitions).toEqual(['Trophée des Champions']);
            });

            it('still syncs valid matches and reports the unknown one', async () => {
                mockTransaction(null);

                const result = await service.loadMatches([formattedMatch, unknownMatch]);

                expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
                expect(result.unknownCompetitions).toEqual(['Trophée des Champions']);
            });

            it('deduplicates repeated unknown competitions', async () => {
                mockTransaction(null);

                const secondUnknown: FormattedMatch = {
                    ...unknownMatch,
                    opponent: 'Lyon' as OpponentName,
                };

                const result = await service.loadMatches([unknownMatch, secondUnknown]);

                expect(prismaService.$transaction).not.toHaveBeenCalled();
                expect(result.unknownCompetitions).toEqual(['Trophée des Champions']);
            });
        });
    });
});
