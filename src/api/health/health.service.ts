import { Injectable } from '@nestjs/common';
import { IHealthDbService } from '../../db/health/health.db.interface';
import { HealthStatus, IHealthService } from './interfaces/health.service.interface';

@Injectable()
export class HealthService implements IHealthService {
    constructor(private readonly db: IHealthDbService) {}

    async check(checkDb: boolean): Promise<HealthStatus> {
        if (!checkDb) {
            return { status: 'ok' };
        }

        const alive = await this.db.ping();

        return { status: 'ok', db: alive ? 'ok' : 'down' };
    }
}
