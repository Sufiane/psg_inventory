import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseRedis } from './base.service';

@Injectable()
export class RedisService extends BaseRedis {
    // todo use node  env to customize TTL for testing
    constructor(configService: ConfigService<{ REDIS_URL: string }, true>) {
        super(configService.get('REDIS_URL'));
    }

    async set<T>(key: string, value: T, ttl?: number) {
        await this.redis.set(key, JSON.stringify(value), ttl ? { EX: ttl } : {});
    }

    async get<T>(key: string): Promise<T | null> {
        const cachedValue = await this.redis.get(key);

        if (!cachedValue) {
            return null;
        }

        return JSON.parse(cachedValue);
    }

    async invalidate(key: string) {
        await this.redis.del(key);
    }
}
