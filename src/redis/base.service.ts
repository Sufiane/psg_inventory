import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

export class BaseRedis implements OnModuleInit, OnModuleDestroy {
    protected readonly redis: RedisClientType;

    constructor(redisUrl: string) {
        this.redis = createClient({
            url: redisUrl,
        });
    }

    async onModuleInit(): Promise<void> {
        await this.redis.connect();
    }

    async onModuleDestroy(): Promise<void> {
        await this.redis.quit();
    }
}
