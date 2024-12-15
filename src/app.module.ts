import { Module } from '@nestjs/common';
import { UsersModule } from './api/users/users.module';
import { ConfigModule } from '@nestjs/config';
import { validate } from './env.schema';
import { JwtAuthGuard } from './shared/guards/jwt.guard';
import { APP_GUARD } from '@nestjs/core';
import { MatchesModule } from './api/matches/matches.module';
import { SalesModule } from './api/sales/sales.module';
import { AccountingModule } from './api/accounting/accounting.module';
import { CronModule } from './crons/cron.module';
import { AdminModule } from './api/admin/admin.module';

@Module({
    imports: [
        ConfigModule.forRoot({ validate, isGlobal: true, cache: true }),
        UsersModule,
        MatchesModule,
        SalesModule,
        AccountingModule,
        CronModule,
        AdminModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: JwtAuthGuard,
        },
    ],
})
export class AppModule {
}
