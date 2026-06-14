import type { Email, HashedPassword } from '@psg/shared/strings';
import { PrismaService } from '../prisma.service';
import { Users } from '@prisma/client';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { Injectable } from '@nestjs/common';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { IUsersDbService } from './users.db.interface';
import { Prisma } from '.prisma/client';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';

@Injectable()
export class UsersService implements IUsersDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async create(payload: {
        email: Email;
        firstName: string;
        lastName: string;
        password: HashedPassword;
    }): Promise<void> {
        try {
            await this.prisma.users.create({ data: payload });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new DomainException(ErrorCode.EMAIL_ALREADY_EXISTS);
            }
            throw e;
        }
    }

    async findOneByEmail(email: Email): Promise<Users | null> {
        const cached = await this.redisService.get(CACHE_KEYS.userByEmail(email));

        if (cached !== null) {
            return cached.value;
        }

        const dbResult = await this.prisma.users.findUnique({
            where: {
                email,
            },
        });

        await this.redisService.set(
            CACHE_KEYS.userByEmail(email),
            dbResult,
            ONE_HOUR_TTL,
        );

        return dbResult;
    }
}
