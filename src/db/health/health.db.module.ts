import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { HealthDb } from './health.db';
import { IHealthDbService } from './health.db.interface';

@Module({
    imports: [PrismaModule],
    providers: [{ provide: IHealthDbService, useClass: HealthDb }],
    exports: [IHealthDbService],
})
export class HealthDbModule {}
