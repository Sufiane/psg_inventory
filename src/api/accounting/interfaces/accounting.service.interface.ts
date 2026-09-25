import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { Amortization } from '../types/amortization.type';
import { TimePeriodAccounting } from '../types/time-period-accounting.type';

export abstract class IAccountingService {
    abstract getCurrentSeason(userId: UserId): Promise<TimePeriodAccounting>;
    abstract getGivenSeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<TimePeriodAccounting>;
    abstract getAllTime(userId: UserId): Promise<TimePeriodAccounting>;
    abstract getAmortization(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<Amortization>;
}
