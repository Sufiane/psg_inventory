import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { DbModule } from '../../db/db.module';
import { IHealthService } from './interfaces/health.service.interface';

@Module({
    imports: [DbModule],
    controllers: [HealthController],
    providers: [{ provide: IHealthService, useClass: HealthService }],
})
export class HealthModule {}
