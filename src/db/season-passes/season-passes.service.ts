import { Injectable } from '@nestjs/common';

import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { PrismaService } from '../prisma.service';
import {
    ISeasonPassesDbService,
    UpsertSeasonPassInput,
} from './season-passes.db.interface';
import { SeasonPass } from './type/season-pass.type';

@Injectable()
export class SeasonPassesService implements ISeasonPassesDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async findBySeason(
        userId: string,
        seasonStartYear: number,
    ): Promise<SeasonPass | null> {
        const cacheKey = CACHE_KEYS.seasonPass(userId, seasonStartYear);
        const cached = await this.redisService.get<SeasonPass>(cacheKey);

        if (cached !== null) {
            return cached.value;
        }

        const result = await this.prisma.seasonPasses.findUnique({
            where: {
                userId_seasonStartYear: { userId, seasonStartYear },
            },
        });

        await this.redisService.set(cacheKey, result, ONE_HOUR_TTL);

        return result;
    }

    async findAll(userId: string): Promise<SeasonPass[]> {
        const cacheKey = CACHE_KEYS.seasonPasses(userId);
        const cached = await this.redisService.get<SeasonPass[]>(cacheKey);

        if (cached !== null) {
            return cached.value ?? [];
        }

        const result = await this.prisma.seasonPasses.findMany({
            where: { userId },
            orderBy: { seasonStartYear: 'desc' },
        });

        await this.redisService.set(cacheKey, result, ONE_HOUR_TTL);

        return result;
    }

    async upsert(payload: UpsertSeasonPassInput): Promise<SeasonPass> {
        const result = await this.prisma.seasonPasses.upsert({
            where: {
                userId_seasonStartYear: {
                    userId: payload.userId,
                    seasonStartYear: payload.seasonStartYear,
                },
            },
            create: {
                userId: payload.userId,
                seasonStartYear: payload.seasonStartYear,
                price: payload.price,
                category: payload.category ?? null,
                row: payload.row ?? null,
                seat: payload.seat ?? null,
            },
            update: {
                price: payload.price,
                category: payload.category ?? null,
                row: payload.row ?? null,
                seat: payload.seat ?? null,
            },
        });

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateSeasonPasses(payload.userId),
        );
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(payload.userId),
        );

        return result;
    }

    async remove(userId: string, seasonStartYear: number): Promise<void> {
        await this.prisma.seasonPasses.delete({
            where: {
                userId_seasonStartYear: { userId, seasonStartYear },
            },
        });

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateSeasonPasses(userId),
        );
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
    }
}
