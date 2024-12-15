import { Controller, Get, Param } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { User } from '../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import { GetSeasonDto } from './dto/get-season.dto';

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

    @Get('/season/:seasonStartYear')
    getSeason(
        @User() user: AuthenticatedUser,
        @Param() { seasonStartYear }: GetSeasonDto,
    ): Promise<TimePeriodAccounting> {
        return this.accountingService.getGivenSeason(
            user.id,
            parseInt(seasonStartYear, 10),
        );
    }
}
