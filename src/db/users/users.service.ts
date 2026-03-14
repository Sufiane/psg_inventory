import { PrismaService } from '../prisma.service';
import { Users } from '@prisma/client';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { Injectable } from '@nestjs/common';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { IUsersDbService } from './users.db.interface';

@Injectable()
export class UsersService implements IUsersDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async create(payload: {
        email: string;
        firstName: string;
        lastName: string;
        password: string;
    }): Promise<void> {
        await this.prisma.users.create({ data: payload });
    }

    async findOneByEmail(email: string): Promise<Users | null> {
        const cachedData = await this.redisService.get<Users | null>(
            CACHE_KEYS.userByEmail(email),
        );

        if (cachedData) {
            return cachedData;
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
