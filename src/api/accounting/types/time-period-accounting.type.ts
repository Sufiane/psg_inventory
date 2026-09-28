import type { SeasonPassPrice } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';

import { Accounting } from './accounting.type';
import { LeadTime } from './lead-time.type';

export type SeasonInvestment = {
    id: string;
    price: SeasonPassPrice;
    seasonStartYear: SeasonYear;
    label: string;
    category: string;
    row: string;
    seat: string;
};

export type TimePeriodAccounting = {
    realized: Accounting | null;
    unrealized: Accounting | null;
    pending: Accounting | null;
    gifted: Accounting | null;
    seasonInvestments: SeasonInvestment[];
    totalSeasonInvestment: SeasonPassPrice;
    leadTime: LeadTime | null;
};
