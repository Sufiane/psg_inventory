import type { SeasonYear, UserId } from '@psg/shared';
import { Accounting } from '../types/accounting.type';
import { Amortization } from '../types/amortization.type';
import { TimePeriodAccounting } from '../types/time-period-accounting.type';

export abstract class IAccountingService {
    abstract getCurrentSeason(userId: UserId): Promise<TimePeriodAccounting>;
    abstract getGivenSeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<TimePeriodAccounting>;
    abstract getAllTime(userId: UserId): Promise<TimePeriodAccounting>;
    abstract getAccounting(
        userId: UserId,
        status: 'realized' | 'pending' | 'unrealized',
        date: { start: Date; end?: Date },
    ): Promise<Accounting | null>;
    abstract getSeason(
        userId: UserId,
        dates: { start: Date; end?: Date },
        seasonStartYear: SeasonYear | null,
    ): Promise<TimePeriodAccounting>;
    abstract getAmortization(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<Amortization>;
}
