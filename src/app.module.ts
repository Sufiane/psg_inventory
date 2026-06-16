import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { UsersModule } from './api/users/users.module';
import { ConfigModule } from '@nestjs/config';
import { validate } from './env.schema';
import { JwtAuthGuard } from './shared/guards/jwt.guard';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { MatchesModule } from './api/matches/matches.module';
import { SalesModule } from './api/sales/sales.module';
import { AccountingModule } from './api/accounting/accounting.module';
import { CronModule } from './crons/cron.module';
import { AdminModule } from './api/admin/admin.module';
import { RedisModule } from './redis/redis.module';
import { SeasonPassesModule } from './api/season-passes/season-passes.module';
import { HealthModule } from './api/health/health.module';

@Module({
    imports: [
        ConfigModule.forRoot({ validate, isGlobal: true, cache: true }),
        LoggerModule.forRoot({
            pinoHttp: {
                genReqId: (req) =>
                    (req.headers['x-request-id'] as string) ?? randomUUID(),
                redact: {
                    paths: [
                        'req.headers.authorization',
                        'req.headers.cookie',
                        'req.body.password',
                        'req.body.refreshToken',
                    ],
                    remove: true,
                },
                ...(process.env.NODE_ENV === 'production'
                    ? {}
                    : {
                          transport: {
                              target: 'pino-pretty',
                              options: { singleLine: true },
                          },
                      }),
            },
        }),
        UsersModule,
        MatchesModule,
        SalesModule,
        AccountingModule,
        CronModule,
        AdminModule,
        RedisModule,
        SeasonPassesModule,
        HealthModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: JwtAuthGuard,
        },
        {
            provide: APP_FILTER,
            useClass: AllExceptionsFilter,
        },
    ],
})
export class AppModule {}
