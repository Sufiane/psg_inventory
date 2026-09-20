import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Prisma } from '@prisma/client';
import type { RecipientId, UserId } from '@psg/shared/ids';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RecipientsDb } from './recipients.db';

describe('RecipientsDb', () => {
    const userId = 'user-1' as UserId;
    let service: RecipientsDb;
    let prisma: DeepMockProxy<PrismaService>;
    let redisService: DeepMockProxy<RedisService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                RecipientsDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        service = module.get(RecipientsDb);
        prisma = module.get(PrismaService);
        redisService = module.get(RedisService);

        module.useLogger(false);

        redisService.get.mockImplementation(
            async <T>(_key: unknown, _ttl: number, loader: () => Promise<T | null>) =>
                loader(),
        );
    });

    describe('when listing a user', () => {
        it('returns recipients with their gift count', async () => {
            prisma.recipients.findMany.mockResolvedValueOnce([
                { id: 'r1', userId, name: 'Marc', _count: { Gifts: 3 } },
                { id: 'r2', userId, name: 'Ana', _count: { Gifts: 1 } },
            ] as never);

            const result = await service.listForUser(userId);

            expect(result).toEqual([
                { id: 'r1', userId, name: 'Marc', giftCount: 3 },
                { id: 'r2', userId, name: 'Ana', giftCount: 1 },
            ]);
            expect(prisma.recipients.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId },
                    select: expect.objectContaining({
                        _count: { select: { Gifts: true } },
                    }),
                }),
            );
        });

        it('caches under the recipients key', async () => {
            prisma.recipients.findMany.mockResolvedValueOnce([]);

            await service.listForUser(userId);

            expect(redisService.get).toHaveBeenCalledWith(
                CACHE_KEYS.recipients(userId),
                60 * 60,
                expect.any(Function),
            );
        });
    });

    describe('when looking a recipient up by name', () => {
        it('matches case-insensitively within the user scope', async () => {
            prisma.recipients.findFirst.mockResolvedValueOnce({
                id: 'r1',
                userId,
                name: 'Marc',
            } as never);

            const result = await service.findByNameForUser(userId, 'marc');

            expect(result).toEqual({ id: 'r1', userId, name: 'Marc' });
            expect(prisma.recipients.findFirst).toHaveBeenCalledWith({
                where: { userId, name: { equals: 'marc', mode: 'insensitive' } },
                select: { id: true, userId: true, name: true },
            });
        });
    });

    describe('when the recipient name is not found', () => {
        it('returns null', async () => {
            prisma.recipients.findFirst.mockResolvedValueOnce(null);

            await expect(service.findByNameForUser(userId, 'nobody')).resolves.toBeNull();
        });
    });

    describe('when creating a recipient', () => {
        it('creates the row scoped to the user', async () => {
            prisma.recipients.upsert.mockResolvedValueOnce({
                id: 'r9',
                userId,
                name: 'Chloé',
            } as never);

            const result = await service.create(userId, 'Chloé');

            expect(result).toEqual({ id: 'r9', userId, name: 'Chloé' });
            expect(prisma.recipients.upsert).toHaveBeenCalledWith({
                where: { userId_name: { userId, name: 'Chloé' } },
                create: { userId, name: 'Chloé' },
                update: { name: 'Chloé' },
                select: { id: true, userId: true, name: true },
            });
        });

        it('invalidates the cached list for that user', async () => {
            prisma.recipients.upsert.mockResolvedValueOnce({
                id: 'r9',
                userId,
                name: 'Chloé',
            } as never);

            await service.create(userId, 'Chloé');

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        });

        describe('when a concurrent request already created the exact same name', () => {
            // Regression for the P2002-inside-a-transaction bug: the old
            // create-then-catch-and-refind recovery ran its refind on the
            // same `tx` as the failed create, and Prisma does not savepoint
            // individual statements inside an interactive transaction — a
            // unique-constraint error there aborts the whole transaction, so
            // the "recovery" query itself failed with 25P02. `upsert` is one
            // atomic statement (INSERT ... ON CONFLICT DO UPDATE): Postgres
            // resolves the race server-side and no error is ever thrown, so
            // there is nothing to catch and nothing to retry.
            it('returns the existing row atomically instead of throwing', async () => {
                prisma.recipients.upsert.mockResolvedValueOnce({
                    id: 'r9',
                    userId,
                    name: 'Chloé',
                } as never);

                await expect(service.create(userId, 'Chloé')).resolves.toEqual({
                    id: 'r9',
                    userId,
                    name: 'Chloé',
                });
                expect(prisma.recipients.findFirst).not.toHaveBeenCalled();
            });
        });

        describe('when the write fails for a reason other than a duplicate name', () => {
            it('propagates the error', async () => {
                prisma.recipients.upsert.mockRejectedValueOnce(
                    new Error('connection lost'),
                );

                await expect(service.create(userId, 'Chloé')).rejects.toThrow(
                    'connection lost',
                );
            });
        });

        describe('when a transaction client is given', () => {
            it('runs the upsert on that client, so a same-name race inside the enclosing sale transaction cannot abort it', async () => {
                const tx = mockDeep<Prisma.TransactionClient>();

                tx.recipients.upsert.mockResolvedValueOnce({
                    id: 'r9',
                    userId,
                    name: 'Chloé',
                } as never);

                const result = await service.create(userId, 'Chloé', tx);

                expect(result).toEqual({ id: 'r9', userId, name: 'Chloé' });
                expect(tx.recipients.upsert).toHaveBeenCalled();
                expect(prisma.recipients.upsert).not.toHaveBeenCalled();
            });

            it('does not invalidate the recipients cache itself', async () => {
                const tx = mockDeep<Prisma.TransactionClient>();

                tx.recipients.upsert.mockResolvedValueOnce({
                    id: 'r9',
                    userId,
                    name: 'Chloé',
                } as never);

                await service.create(userId, 'Chloé', tx);

                expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            });
        });
    });

    describe('when resolving-or-creating a recipient by name', () => {
        describe('when the name already exists', () => {
            it('returns the existing recipient without creating one', async () => {
                prisma.recipients.findFirst.mockResolvedValueOnce({
                    id: 'r1',
                    userId,
                    name: 'Marc',
                } as never);

                const result = await service.findOrCreateForUser(userId, 'marc');

                expect(result).toEqual({ id: 'r1', userId, name: 'Marc' });
                expect(prisma.recipients.create).not.toHaveBeenCalled();
            });
        });

        describe('when the name does not exist yet', () => {
            it('creates it', async () => {
                prisma.recipients.findFirst.mockResolvedValueOnce(null);
                prisma.recipients.upsert.mockResolvedValueOnce({
                    id: 'r9',
                    userId,
                    name: 'Chloé',
                } as never);

                const result = await service.findOrCreateForUser(userId, 'Chloé');

                expect(result).toEqual({ id: 'r9', userId, name: 'Chloé' });
            });
        });

        describe('when a transaction client is given', () => {
            it('runs the find and the create on that client instead of the default one', async () => {
                const tx = mockDeep<Prisma.TransactionClient>();

                tx.recipients.findFirst.mockResolvedValueOnce(null);
                tx.recipients.upsert.mockResolvedValueOnce({
                    id: 'r9',
                    userId,
                    name: 'Chloé',
                } as never);

                const result = await service.findOrCreateForUser(userId, 'Chloé', tx);

                expect(result).toEqual({ id: 'r9', userId, name: 'Chloé' });
                expect(tx.recipients.findFirst).toHaveBeenCalled();
                expect(tx.recipients.upsert).toHaveBeenCalled();
                expect(prisma.recipients.findFirst).not.toHaveBeenCalled();
                expect(prisma.recipients.upsert).not.toHaveBeenCalled();
            });

            it('does not invalidate the recipients cache itself', async () => {
                // The caller (e.g. the sale-update transaction) hasn't
                // committed yet at this point — invalidating here would
                // advertise a recipient a later rollback could still undo.
                const tx = mockDeep<Prisma.TransactionClient>();

                tx.recipients.findFirst.mockResolvedValueOnce(null);
                tx.recipients.upsert.mockResolvedValueOnce({
                    id: 'r9',
                    userId,
                    name: 'Chloé',
                } as never);

                await service.findOrCreateForUser(userId, 'Chloé', tx);

                expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            });
        });
    });

    describe('when finding a recipient by id for a user', () => {
        it('returns the recipient when it belongs to that user', async () => {
            prisma.recipients.findFirst.mockResolvedValueOnce({
                id: 'r1',
                userId,
                name: 'Marc',
            } as never);

            const result = await service.findByIdForUser('r1' as RecipientId, userId);

            expect(result).toEqual({ id: 'r1', userId, name: 'Marc' });
            expect(prisma.recipients.findFirst).toHaveBeenCalledWith({
                where: { id: 'r1', userId },
                select: { id: true, userId: true, name: true },
            });
        });

        describe('when the recipient does not exist or belongs to another user', () => {
            it('returns null', async () => {
                prisma.recipients.findFirst.mockResolvedValueOnce(null);

                await expect(
                    service.findByIdForUser('r-other' as RecipientId, userId),
                ).resolves.toBeNull();
            });
        });
    });
});
