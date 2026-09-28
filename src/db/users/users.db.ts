import type { UserId } from '@psg/shared/ids';
import type { Email, HashedPassword } from '@psg/shared/strings';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { Injectable } from '@nestjs/common';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { IUsersDbService, UserRecord } from './users.db.interface';
import { Prisma, Users } from '@prisma/client';

@Injectable()
export class UsersDb implements IUsersDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async create(payload: {
        email: Email;
        firstName: string;
        lastName: string;
        password: HashedPassword;
    }): Promise<Users | null> {
        try {
            return await this.prisma.users.create({ data: payload });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                // Unique violation on email → no row created. The db reports
                // the raw outcome; the service decides what it means.
                return null;
            }

            throw error;
        }
    }

    async findOneByEmail(email: Email): Promise<UserRecord | null> {
        return this.redisService.get(CACHE_KEYS.userByEmail(email), ONE_HOUR_TTL, () =>
            this.prisma.users.findUnique({
                where: {
                    email,
                },
            }),
        ) as Promise<UserRecord | null>;
    }

    async findById(id: UserId): Promise<UserRecord | null> {
        return this.prisma.users.findUnique({
            where: { id },
        }) as Promise<UserRecord | null>;
    }
}
