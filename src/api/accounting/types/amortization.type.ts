import type { MatchId, SeasonPassId } from '@psg/shared/ids';
import type { Profit, SeasonPassPrice } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';

export type AmortizationMatchRow = {
    matchId: MatchId;
    date: Date;
    opponent: string;
    competition: string;
    atHome: boolean;
    matchProfit: number;
    cumulative: number;
    isBreakEven: boolean;
};

export type AmortizationBreakEven = {
    matchId: MatchId;
    date: Date;
    opponent: string;
    cumulative: number;
};

export type AmortizationPass = {
    id: SeasonPassId;
    label: string;
    price: SeasonPassPrice;
};

export type Amortization = {
    seasonStartYear: SeasonYear;
    passPrice: SeasonPassPrice;
    hasPass: boolean;
    totalRealized: Profit;
    progress: number;
    remaining: number;
    surplus: number;
    breakEven: AmortizationBreakEven | null;
    perMatch: AmortizationMatchRow[];
    passes: AmortizationPass[];
};
