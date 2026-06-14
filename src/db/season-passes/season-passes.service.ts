import { Injectable } from '@nestjs/common';

import type { SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { PrismaService } from '../prisma.service';
import {
    CreateSeasonPassInput,
    ISeasonPassesDbService,
    UpdateSeasonPassInput,
} from './season-passes.db.interface';
import { SeasonPass } from './type/season-pass.type';

@Injectable()
export class SeasonPassesService implements ISeasonPassesDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async findById(id: SeasonPassId): Promise<SeasonPass | null> {
        const cacheKey = CACHE_KEYS.seasonPass(id);
        const cached = await this.redisService.get<SeasonPass>(cacheKey);

        if (cached !== null) {
            return cached.value;
        }

        const result = await this.prisma.seasonPasses.findUnique({
            where: { id },
        });

        await this.redisService.set(cacheKey, result, ONE_HOUR_TTL);

        return result as SeasonPass | null;
    }

    async findBySeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<SeasonPass[]> {
        const cacheKey = CACHE_KEYS.seasonPassesBySeason(userId, seasonStartYear);
        const cached = await this.redisService.get<SeasonPass[]>(cacheKey);

        if (cached !== null) {
            return cached.value ?? [];
        }

        const result = await this.prisma.seasonPasses.findMany({
            where: { userId, seasonStartYear },
            orderBy: [{ category: 'asc' }, { row: 'asc' }, { seat: 'asc' }],
        });

        await this.redisService.set(cacheKey, result, ONE_HOUR_TTL);

        return result as SeasonPass[];
    }

    async findAll(userId: UserId): Promise<SeasonPass[]> {
        const cacheKey = CACHE_KEYS.seasonPasses(userId);
        const cached = await this.redisService.get<SeasonPass[]>(cacheKey);

        if (cached !== null) {
            return cached.value ?? [];
        }

        const result = await this.prisma.seasonPasses.findMany({
            where: { userId },
            orderBy: [{ seasonStartYear: 'desc' }, { label: 'asc' }],
        });

        await this.redisService.set(cacheKey, result, ONE_HOUR_TTL);

        return result as SeasonPass[];
    }

    async create(payload: CreateSeasonPassInput): Promise<SeasonPass> {
        const result = (await this.prisma.seasonPasses.create({
            data: payload,
        })) as SeasonPass;

        await this.invalidate(payload.userId, result.id);

        return result;
    }

    async update(id: SeasonPassId, payload: UpdateSeasonPassInput): Promise<SeasonPass> {
        const result = (await this.prisma.seasonPasses.update({
            where: { id },
            data: payload,
        })) as SeasonPass;

        await this.invalidate(result.userId, id);

        return result;
    }

    async remove(id: SeasonPassId): Promise<void> {
        const existing = await this.prisma.seasonPasses.findUnique({
            where: { id },
            select: { userId: true },
        });

        await this.prisma.seasonPasses.delete({ where: { id } });

        if (existing) {
            await this.invalidate(existing.userId as UserId, id);
        }
    }

    countAllocations(seasonPassId: SeasonPassId): Promise<number> {
        return this.prisma.salePassAllocations.count({
            where: { seasonPassId },
        });
    }

    private async invalidate(userId: UserId, seasonPassId: SeasonPassId): Promise<void> {
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateSeasonPasses(userId),
        );
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateSeasonPassById(seasonPassId),
        );
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
    }
}
