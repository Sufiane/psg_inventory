import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HealthDbModule } from '../../db/health/health.db.module';
import { IHealthService } from './interfaces/health.service.interface';

@Module({
    imports: [HealthDbModule],
    controllers: [HealthController],
    providers: [{ provide: IHealthService, useClass: HealthService }],
})
export class HealthModule {}
