import { Controller, Get, Param } from '@nestjs/common';
import type { SeasonYear } from '@psg/shared/time';
import { toHttpException } from '../../common/exceptions/http-exception.mapper';
import { IAccountingService } from './interfaces/accounting.service.interface';
import { User } from '../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import { GetSeasonDto } from './dto/get-season.dto';
import { Amortization } from './types/amortization.type';

@Controller('accounting')
export class AccountingController {
    constructor(private readonly accountingService: IAccountingService) {}

    @Get('current-season')
    async getCurrentSeason(
        @User() user: AuthenticatedUser,
    ): Promise<TimePeriodAccounting> {
        try {
            return await this.accountingService.getCurrentSeason(user.id);
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Get('all-time')
    async getAllTime(@User() user: AuthenticatedUser): Promise<TimePeriodAccounting> {
        try {
            return await this.accountingService.getAllTime(user.id);
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Get('/season/:seasonStartYear')
    async getSeason(
        @User() user: AuthenticatedUser,
        @Param() { seasonStartYear }: GetSeasonDto,
    ): Promise<TimePeriodAccounting> {
        try {
            return await this.accountingService.getGivenSeason(
                user.id,
                parseInt(seasonStartYear, 10) as SeasonYear,
            );
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Get('/amortization/:seasonStartYear')
    async getAmortization(
        @User() user: AuthenticatedUser,
        @Param() { seasonStartYear }: GetSeasonDto,
    ): Promise<Amortization> {
        try {
            return await this.accountingService.getAmortization(
                user.id,
                parseInt(seasonStartYear, 10) as SeasonYear,
            );
        } catch (e) {
            throw toHttpException(e);
        }
    }
}
