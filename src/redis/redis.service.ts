import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { CacheKey, CacheKeyPattern } from '@psg/shared/cache';
import { BaseRedis } from './base.service';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;
const TTL_JITTER_RATIO = 0.1;

const LOCK_TTL_SEC = 10;
const RETRY_INITIAL_MS = 50;
const RETRY_MAX_MS = 250;
const WAIT_BUDGET_MS = LOCK_TTL_SEC * 1000;

function jitterTtl(ttl: number): number {
    const jitter = Math.floor(Math.random() * ttl * TTL_JITTER_RATIO);

    return ttl + jitter;
}

@Injectable()
export class RedisService extends BaseRedis {
    private readonly logger = new Logger(RedisService.name);

    constructor(configService: ConfigService<{ REDIS_URL: string }, true>) {
        super(configService.get('REDIS_URL'));
    }

    async set<T>(key: CacheKey<T>, value: T | null, ttl: number): Promise<void> {
        await this.redis.set(key, JSON.stringify(value), { EX: jitterTtl(ttl) });
    }

    // Cache-aside with single-flight: only one caller per key runs `loader` at
    // a time. Others wait for the cache to fill. Lock is a Redis SET NX EX on
    // `lock:${key}` with a random token; release compares token before DEL so
    // a slow holder cannot delete a successor's lock (race window is tiny and
    // worst case is one redundant cache fill).
    async get<T>(
        key: CacheKey<T>,
        ttl: number,
        loader: () => Promise<T | null>,
    ): Promise<T | null> {
        const cached = await this.peek(key);

        if (cached !== null) {
            return cached.value;
        }

        const lockKey = `lock:${key}`;
        const token = randomUUID();
        const acquired = await this.redis.set(lockKey, token, {
            NX: true,
            EX: LOCK_TTL_SEC,
        });

        if (acquired === 'OK') {
            try {
                const value = await loader();

                await this.set(key, value, ttl);

                return value;
            } finally {
                const current = await this.redis.get(lockKey);

                if (current === token) {
                    await this.redis.del(lockKey);
                }
            }
        }

        return this.waitForCacheFill(key, loader);
    }

    private async waitForCacheFill<T>(
        key: CacheKey<T>,
        loader: () => Promise<T | null>,
    ): Promise<T | null> {
        const deadline = Date.now() + WAIT_BUDGET_MS;
        let delay = RETRY_INITIAL_MS;

        while (Date.now() < deadline) {
            await sleep(delay);

            const cached = await this.peek(key);

            if (cached !== null) {
                return cached.value;
            }

            delay = Math.min(delay * 2, RETRY_MAX_MS);
        }

        this.logger.warn(
            `get waiter timed out for key=${key}; running loader without cache fill`,
        );

        return loader();
    }

    // Raw cache read. Returns `{ value }` for a hit (incl. cached `null`)
    // or `null` for a miss. Used by `get` internally; also exposed for
    // callers that need a presence check without a loader (e.g. auth
    // looking up a refresh token).
    async peek<T>(key: CacheKey<T>): Promise<{ value: T | null } | null> {
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
