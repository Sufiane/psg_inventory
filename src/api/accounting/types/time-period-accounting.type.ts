import { Accounting } from './accounting.type';
import { LeadTime } from './lead-time.type';

export type SeasonInvestment = {
    id: string;
    price: number;
    seasonStartYear: number;
    label: string;
    category: string;
    row: string;
    seat: string;
};

export type TimePeriodAccounting = {
    realized: Accounting | null;
    unrealized: Accounting | null;
    pending: Accounting | null;
    seasonInvestments: SeasonInvestment[];
    totalSeasonInvestment: number;
    leadTime: LeadTime | null;
};
