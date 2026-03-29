import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseRedis } from './base.service';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;

@Injectable()
export class RedisService extends BaseRedis {
    // todo use node  env to customize TTL for testing
    constructor(configService: ConfigService<{ REDIS_URL: string }, true>) {
        super(configService.get('REDIS_URL'));
    }

    async set<T>(key: string, value: T, ttl?: number) {
        await this.redis.set(key, JSON.stringify(value), ttl ? { EX: ttl } : {});
    }

    async get<T>(key: string): Promise<{ value: T | null } | null> {
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

    async invalidate(key: string) {
        await this.redis.del(key);
    }

    async invalidatePattern(pattern: string) {
        const keys: string[] = [];

        for await (const key of this.redis.scanIterator({ MATCH: pattern })) {
            keys.push(key);
        }

        if (keys.length > 0) {
            await this.redis.del(keys);
        }
    }
}
