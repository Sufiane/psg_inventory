import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Prisma } from '.prisma/client';
import { MatchesService } from './matches.service';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { FormattedMatch } from '../../shared/types/formatted-match.type';
import type { OpponentName } from '@psg/shared/strings';

describe('MatchesService (db)', () => {
    let service: MatchesService;
    let prismaService: DeepMockProxy<PrismaService>;
    let redisService: DeepMockProxy<RedisService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                MatchesService,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        service = module.get(MatchesService);
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

        function mockTransaction(existingMatchId: string | null): void {
            const tx = mockDeep<Prisma.TransactionClient>();

            tx.opponents.upsert.mockResolvedValue({ id: 'opponent-id' } as never);
            tx.matches.findFirst.mockResolvedValue(
                existingMatchId ? ({ id: existingMatchId } as never) : null,
            );

            (prismaService.$transaction as jest.Mock).mockImplementation(
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
                    CACHE_KEYS.match('existing-match-id', true),
                );
                expect(redisService.invalidate).toHaveBeenCalledWith(
                    CACHE_KEYS.match('existing-match-id', false),
                );
            });

            it('does not run a full-keyspace pattern scan per updated match', async () => {
                await service.loadMatches([formattedMatch]);

                // Only the one namespace-wide flush below — no per-match
                // invalidatePattern call, which is what used to force an
                // extra full-keyspace SCAN per updated match.
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

                (prismaService.$transaction as jest.Mock).mockImplementation(
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
                    CACHE_KEYS.match('first-match-id', true),
                );
                expect(redisService.invalidate).toHaveBeenCalledWith(
                    CACHE_KEYS.match('first-match-id', false),
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

            it('propagates the transaction error to the caller', async () => {
                await expect(
                    service.loadMatches([firstMatch, secondMatch]),
                ).rejects.toThrow('db exploded');
            });
        });
    });
});
