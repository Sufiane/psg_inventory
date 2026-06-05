import { Accounting } from './accounting.type';
import { LeadTime } from './lead-time.type';

export type SeasonInvestment = {
    price: number;
    seasonStartYear: number;
    category: string | null;
    row: string | null;
    seat: string | null;
};

export type TimePeriodAccounting = {
    realized: Accounting | null;
    unrealized: Accounting | null;
    pending: Accounting | null;
    seasonInvestment: SeasonInvestment | null;
    totalSeasonInvestment: number;
    leadTime: LeadTime | null;
};
