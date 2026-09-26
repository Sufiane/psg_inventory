import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import {
    getCurrentSeasonDate,
    getSeasonWindow,
    seasonStartYearFromDate,
} from '../../shared/utils/season.utils';
import { IAccountingService } from './interfaces/accounting.service.interface';
import { Amortization } from './types/amortization.type';
import { TimePeriodAccounting } from './types/time-period-accounting.type';
import { IGetSeasonAccountingUsecase } from './usecases/get-season-accounting/get-season-accounting.usecase';
import { IGetAmortizationUsecase } from './usecases/get-amortization/get-amortization.usecase';

@Injectable()
export class AccountingService implements IAccountingService {
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly getSeasonAccountingUsecase: IGetSeasonAccountingUsecase,
        private readonly getAmortizationUsecase: IGetAmortizationUsecase,
    ) {}

    async getCurrentSeason(userId: UserId): Promise<TimePeriodAccounting> {
        const seasonDate = getCurrentSeasonDate();
        const year = seasonStartYearFromDate(seasonDate.start);

        return this.getSeasonAccountingUsecase.execute(userId, seasonDate, year);
    }

    async getGivenSeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<TimePeriodAccounting> {
        const dates = getSeasonWindow(seasonStartYear, 'inclusive');

        return this.getSeasonAccountingUsecase.execute(userId, dates, seasonStartYear);
    }

    async getAllTime(userId: UserId): Promise<TimePeriodAccounting> {
        const oldestMatchSale = await this.salesDbService.getOldestMatchSale(userId);

        return this.getSeasonAccountingUsecase.execute(
            userId,
            {
                start: oldestMatchSale.Match.date,
            },
            null,
        );
    }

    async getAmortization(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<Amortization> {
        return this.getAmortizationUsecase.execute(userId, seasonStartYear);
    }
}
