import { Accounting } from '../types/accounting.type';
import { TimePeriodAccounting } from '../types/time-period-accounting.type';

export abstract class IAccountingService {
    abstract getCurrentSeason(userId: string): Promise<TimePeriodAccounting>;
    abstract getGivenSeason(
        userId: string,
        seasonStartYear: number,
    ): Promise<TimePeriodAccounting>;
    abstract getAllTime(userId: string): Promise<TimePeriodAccounting>;
    abstract getAccounting(
        userId: string,
        status: 'realized' | 'pending' | 'unrealized',
        date: { start: Date; end?: Date },
    ): Promise<Accounting | null>;
    abstract getSeason(
        userId: string,
        dates: { start: Date; end?: Date },
    ): Promise<TimePeriodAccounting>;
}
