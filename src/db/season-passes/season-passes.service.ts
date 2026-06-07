import { Injectable } from '@nestjs/common';

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

    async findById(id: string): Promise<SeasonPass | null> {
        const cacheKey = CACHE_KEYS.seasonPass(id);
        const cached = await this.redisService.get<SeasonPass>(cacheKey);

        if (cached !== null) {
            return cached.value;
        }

        const result = await this.prisma.seasonPasses.findUnique({
            where: { id },
        });

        await this.redisService.set(cacheKey, result, ONE_HOUR_TTL);

        return result;
    }

    async findBySeason(userId: string, seasonStartYear: number): Promise<SeasonPass[]> {
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
            orderBy: [{ seasonStartYear: 'desc' }, { label: 'asc' }],
        });

        await this.redisService.set(cacheKey, result, ONE_HOUR_TTL);

        return result;
    }

    async create(payload: CreateSeasonPassInput): Promise<SeasonPass> {
        const result = await this.prisma.seasonPasses.create({
            data: payload,
        });

        await this.invalidate(payload.userId, result.id);

        return result;
    }

    async update(id: string, payload: UpdateSeasonPassInput): Promise<SeasonPass> {
        const result = await this.prisma.seasonPasses.update({
            where: { id },
            data: payload,
        });

        await this.invalidate(result.userId, id);

        return result;
    }

    async remove(id: string): Promise<void> {
        const existing = await this.prisma.seasonPasses.findUnique({
            where: { id },
            select: { userId: true },
        });

        await this.prisma.seasonPasses.delete({ where: { id } });

        if (existing) {
            await this.invalidate(existing.userId, id);
        }
    }

    countAllocations(seasonPassId: string): Promise<number> {
        return this.prisma.salePassAllocations.count({
            where: { seasonPassId },
        });
    }

    private async invalidate(userId: string, seasonPassId: string): Promise<void> {
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
