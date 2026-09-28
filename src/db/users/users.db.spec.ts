import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Prisma, Users } from '@prisma/client';

import { UsersDb } from './users.db';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { Email, HashedPassword } from '@psg/shared/strings';

describe('UsersDb', () => {
    let usersDb: UsersDb;
    let prisma: DeepMockProxy<PrismaService>;

    const payload = {
        email: 'ada@example.com' as Email,
        firstName: 'Ada',
        lastName: 'Lovelace',
        password: 'hashed-password' as HashedPassword,
    };

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UsersDb,
                { provide: PrismaService, useValue: mockDeep<PrismaService>() },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usersDb = module.get(UsersDb);
        prisma = module.get(PrismaService);

        module.useLogger(false);
    });

    describe('create', () => {
        it('returns the row prisma created', async () => {
            const created = { id: 'user-1', ...payload } as unknown as Users;
            prisma.users.create.mockResolvedValueOnce(created);

            const result = await usersDb.create(payload);

            expect(result).toBe(created);
            expect(prisma.users.create).toHaveBeenCalledWith({ data: payload });
        });

        it('returns null when the email already exists (P2002)', async () => {
            prisma.users.create.mockRejectedValueOnce(
                new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
                    code: 'P2002',
                    clientVersion: '6.0.1',
                }),
            );

            const result = await usersDb.create(payload);

            expect(result).toBeNull();
        });

        it('rethrows any other prisma error', async () => {
            prisma.users.create.mockRejectedValueOnce(new Error('connection lost'));

            await expect(usersDb.create(payload)).rejects.toThrow('connection lost');
        });
    });
});
