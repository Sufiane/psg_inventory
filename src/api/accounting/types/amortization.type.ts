import type { MatchId, SeasonPassId } from '@psg/shared';

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
    price: number;
};

export type Amortization = {
    seasonStartYear: number;
    passPrice: number;
    hasPass: boolean;
    totalRealized: number;
    progress: number;
    remaining: number;
    surplus: number;
    breakEven: AmortizationBreakEven | null;
    perMatch: AmortizationMatchRow[];
    passes: AmortizationPass[];
};
