import { Controller, Get } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { User } from '../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { TimePeriodAccounting } from './types/time-period-accounting.type';

@Controller('accounting')
export class AccountingController {
    constructor(private readonly accountingService: AccountingService) {}

    @Get('current-season')
    getCurrentSeason(@User() user: AuthenticatedUser): Promise<TimePeriodAccounting> {
        return this.accountingService.getCurrentSeason(user.id);
    }

    @Get('all-time')
    getAllTime(@User() user: AuthenticatedUser): Promise<TimePeriodAccounting> {
        return this.accountingService.getAllTime(user.id);
    }
}
