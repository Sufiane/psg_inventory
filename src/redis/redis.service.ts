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

// INCR then EXPIRE as two round-trips leaves a window where a crash between
// them strands the key with no TTL (never expires). A single script makes
// the increment and the first-hit expiry atomic in one round trip.
const INCREMENT_WITH_TTL_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

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

    // Fixed-window counter, atomic end to end via a single Lua script (see
    // INCREMENT_WITH_TTL_SCRIPT): concurrent questions cannot both read a
    // stale count and slip past the cap, and a crash mid-call cannot strand
    // the key without a TTL. The TTL is set only when the counter is created
    // (count === 1) — re-expiring on every hit would turn this into a
    // sliding window that never resets for an active user.
    //
    // No try/catch here: a Redis outage should fail loudly, the same as
    // every other RedisService caller in this app (accounting.service.ts,
    // sales.service.ts, admin.service.ts) — the error bubbles up and
    // AllExceptionsFilter/toHttpException already turn any unmapped error
    // into a logged, structured 500 (ErrorCode.INTERNAL_ERROR) rather than a
    // raw leak or a silent no-op.
    async incrementWithTtl(key: CacheKey<number>, ttlSeconds: number): Promise<number> {
        const count = await this.redis.eval(INCREMENT_WITH_TTL_SCRIPT, {
            keys: [key],
            arguments: [String(ttlSeconds)],
        });

        return Number(count);
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

    // Used to give back a slot a caller consumed via incrementWithTtl but
    // could not make use of (e.g. a fixed-window rate limit counter after a
    // downstream failure). Never lets the key go negative or resurrect an
    // expired window: DECR on a missing key would recreate it with no TTL.
    async decrement(key: CacheKey<number>): Promise<void> {
        const exists = await this.redis.exists(key);

        if (exists === 0) {
            return;
        }

        const value = await this.redis.decr(key);

        if (value < 0) {
            await this.redis.set(key, '0');
        }
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
