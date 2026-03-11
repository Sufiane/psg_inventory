import { PrismaService } from './prisma.service';
import { Users } from '@prisma/client';
import { RedisService } from '../redis/redis.service';
import CACHE_KEYS from '../redis/CACHE_KEYS';
import { Injectable } from '@nestjs/common';
import { ONE_HOUR_TTL } from '../shared/constants';

@Injectable()
export class UsersService extends PrismaService {
    constructor(private readonly redisService: RedisService) {
        super();
    }

    async create(payload: {
        email: string;
        firstName: string;
        lastName: string;
        password: string;
    }): Promise<void> {
        await this.users.create({ data: payload });
    }

    async findOneByEmail(email: string): Promise<Users | null> {
        const cachedData = await this.redisService.get<Users | null>(
            CACHE_KEYS.userByEmail(email),
        );

        if (cachedData) {
            return cachedData;
        }

        const dbResult = await this.users.findUnique({
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
