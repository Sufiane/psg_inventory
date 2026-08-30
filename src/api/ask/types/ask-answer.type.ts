export type AskFigures = {
    seasonStartYear: number;
    currentSeasonProfit: number | null;
    currentSeasonSales: number | null;
    currentSeasonTickets: number | null;
    allTimeProfit: number | null;
    allTimeSales: number | null;
    pendingSales: number | null;
    totalSeasonInvestment: number;
    amortizationRemaining: number;
    brokeEven: boolean;
};

export type AskAnswer = {
    question: string;
    answer: string;
    figures: AskFigures;
    generatedAt: string;
};
