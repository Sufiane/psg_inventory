export type AmortizationMatchRow = {
    matchId: string;
    date: Date;
    opponent: string;
    competition: string;
    atHome: boolean;
    matchProfit: number;
    cumulative: number;
    isBreakEven: boolean;
};

export type AmortizationBreakEven = {
    matchId: string;
    date: Date;
    opponent: string;
    cumulative: number;
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
};
