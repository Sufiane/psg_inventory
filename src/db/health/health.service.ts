import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IHealthDbService } from './health.db.interface';

@Injectable()
export class HealthService implements IHealthDbService {
    constructor(private readonly prisma: PrismaService) {}

    async ping(): Promise<boolean> {
        try {
            await this.prisma.$queryRaw`SELECT 1`;

            return true;
        } catch {
            return false;
        }
    }
}
