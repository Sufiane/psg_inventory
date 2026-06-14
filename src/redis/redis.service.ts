import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CacheKey, CacheKeyPattern } from '@psg/shared/cache';
import { BaseRedis } from './base.service';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;
const TTL_JITTER_RATIO = 0.1;

function jitterTtl(ttl: number): number {
    const jitter = Math.floor(Math.random() * ttl * TTL_JITTER_RATIO);

    return ttl + jitter;
}

@Injectable()
export class RedisService extends BaseRedis {
    constructor(configService: ConfigService<{ REDIS_URL: string }, true>) {
        super(configService.get('REDIS_URL'));
    }

    async set<T>(key: CacheKey<T>, value: T | null, ttl: number): Promise<void> {
        await this.redis.set(key, JSON.stringify(value), { EX: jitterTtl(ttl) });
    }

    async get<T>(key: CacheKey<T>): Promise<{ value: T | null } | null> {
        const cachedValue = await this.redis.get(key);

        if (cachedValue === null) {
            return null;
        }

        return {
            value: JSON.parse(cachedValue, (_key, value) => {
                if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) {
                    return new Date(value);
                }

                return value;
            }),
        };
    }

    async invalidate<T>(key: CacheKey<T>): Promise<void> {
        await this.redis.del(key);
    }

    async invalidatePattern(pattern: CacheKeyPattern): Promise<void> {
        const keys: string[] = [];

        for await (const key of this.redis.scanIterator({ MATCH: pattern })) {
            keys.push(key);
        }

        if (keys.length > 0) {
            await this.redis.del(keys);
        }
    }
}
