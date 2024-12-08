import { Controller, Get } from '@nestjs/common';
import { CurrentSeasonAccounting } from './types/current-season-accounting.type';
import { AccountingService } from './accounting.service';
import { User } from '../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';

@Controller('accounting')
export class AccountingController {

    constructor(private readonly accountingService: AccountingService) {
    }

    @Get('current-season')
    getCurrentSeason(
        @User() user: AuthenticatedUser,
    ): Promise<CurrentSeasonAccounting | null> {
        return this.accountingService.getCurrentSeason(user.id);
    }

    @Get('all-time')
    getAllTime(@User() user: AuthenticatedUser) {
        return this.accountingService.getAllTime(user.id, user.createdAt);
    }
}
