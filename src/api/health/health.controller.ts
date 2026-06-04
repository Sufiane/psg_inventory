import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../shared/decorators/public.decorator';
import { QueryHealthDto } from './dto/query-health.dto';
import { HealthStatus, IHealthService } from './interfaces/health.service.interface';

@Public()
@Controller('health')
export class HealthController {
    constructor(private readonly healthService: IHealthService) {}

    @Get('/')
    async check(@Query() { db }: QueryHealthDto): Promise<HealthStatus> {
        return this.healthService.check(db === true);
    }
}
