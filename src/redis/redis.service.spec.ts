import { ConfigService } from '@nestjs/config';
import type { CacheKey } from '@psg/shared/cache';

import { RedisService } from './redis.service';

const evalMock = jest.fn();
const incrMock = jest.fn();
const expireMock = jest.fn();

jest.mock('redis', () => ({
    createClient: jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        eval: evalMock,
        incr: incrMock,
        expire: expireMock,
    })),
}));

const RATE_LIMIT_KEY = 'ask:user:id:u1:hour:2026083014' as CacheKey<number>;

describe('RedisService', () => {
    let service: RedisService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new RedisService(
            new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
        );
    });

    describe('incrementWithTtl', () => {
        it('increments and sets the ttl atomically via a single round trip', async () => {
            evalMock.mockResolvedValue(1);

            const count = await service.incrementWithTtl(RATE_LIMIT_KEY, 3600);

            expect(count).toBe(1);
            expect(evalMock).toHaveBeenCalledTimes(1);
            expect(incrMock).not.toHaveBeenCalled();
            expect(expireMock).not.toHaveBeenCalled();
        });

        it('scopes the script to the given key and ttl', async () => {
            evalMock.mockResolvedValue(5);

            await service.incrementWithTtl(RATE_LIMIT_KEY, 3600);

            const options = evalMock.mock.calls[0][1] as {
                keys: string[];
                arguments: string[];
            };

            expect(options.keys).toEqual([RATE_LIMIT_KEY]);
            expect(options.arguments).toEqual(['3600']);
        });

        describe('when redis is unavailable', () => {
            beforeEach(() => {
                evalMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
            });

            it('propagates the failure rather than swallowing it', async () => {
                // No per-call try/catch here by design: every other RedisService
                // caller in this app (accounting.service.ts, sales.service.ts,
                // admin.service.ts) lets a Redis failure bubble up uncaught, and
                // AllExceptionsFilter -> toHttpException already turns any
                // unmapped error into a logged, structured 500
                // (ErrorCode.INTERNAL_ERROR) rather than a raw leak. Swallowing
                // it here would be the inconsistent choice.
                await expect(
                    service.incrementWithTtl(RATE_LIMIT_KEY, 3600),
                ).rejects.toThrow('connect ECONNREFUSED');
            });
        });
    });

    describe('decrement', () => {
        it('decrements atomically via a single round trip', async () => {
            evalMock.mockResolvedValue(4);

            await service.decrement(RATE_LIMIT_KEY);

            expect(evalMock).toHaveBeenCalledTimes(1);
        });

        it('scopes the script to the given key', async () => {
            evalMock.mockResolvedValue(4);

            await service.decrement(RATE_LIMIT_KEY);

            const options = evalMock.mock.calls[0][1] as { keys: string[] };

            expect(options.keys).toEqual([RATE_LIMIT_KEY]);
        });

        describe('when redis is unavailable', () => {
            beforeEach(() => {
                evalMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
            });

            it('propagates the failure rather than swallowing it', async () => {
                await expect(service.decrement(RATE_LIMIT_KEY)).rejects.toThrow(
                    'connect ECONNREFUSED',
                );
            });
        });
    });
});
