export type AskExtreme = {
    price: number;
    profit: number;
    opponent: string;
    date: string;
    atHome: boolean;
    competition: string;
};

export type AskAccounting = {
    // Sum of listed sale prices, not a count of anything — see
    // SYSTEM_PROMPT for the explicit definition sent to the model, which
    // exists precisely so this isn't confused with totalNbTickets.
    totalListedValue: number;
    totalProfit: number;
    totalInvest: number;
    totalNbTickets: number;
    averageTicketPrice: number;
    averageProfit: number;
    highest: AskExtreme | null;
    lowest: AskExtreme | null;
};

export type AskLeadTime = {
    soldCount: number;
    avgLeadDays: number;
    medianLeadDays: number;
    minLeadDays: number;
    maxLeadDays: number;
};

export type AskSeasonPass = {
    label: string;
    category: string;
    price: number;
    seasonStartYear: number;
};

export type AskPeriod = {
    realized: AskAccounting | null;
    unrealized: AskAccounting | null;
    pending: AskAccounting | null;
    seasonPasses: AskSeasonPass[];
    totalSeasonInvestment: number;
    leadTime: AskLeadTime | null;
};

export type AskAmortization = {
    passPrice: number;
    hasPass: boolean;
    totalRealized: number;
    progress: number;
    remaining: number;
    surplus: number;
    brokeEven: boolean;
};

export type AskPlayedMatch = {
    date: string;
    opponent: string;
    atHome: boolean;
    competition: string;
    score: string | undefined;
    isWin: boolean | undefined;
};

export type AskUpcomingMatch = {
    date: string;
    opponent: string;
    atHome: boolean;
    competition: string;
};

// The complete set of facts the model is permitted to reason from. Named for
// its role in the LLM call rather than as a generic point-in-time copy.
export type AskContext = {
    generatedAt: string;
    currency: 'EUR';
    season: {
        startYear: number;
        startDate: string;
        endDate: string;
    };
    currentSeason: AskPeriod;
    allTime: AskPeriod;
    amortization: AskAmortization;
    matches: {
        played: AskPlayedMatch[];
        upcoming: AskUpcomingMatch[];
    };
};
