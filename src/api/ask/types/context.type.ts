import type { TicketCount } from '@psg/shared/counts';
import type { Profit, TotalInvestment, TotalListedValue } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';

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
    totalListedValue: TotalListedValue;
    totalProfit: number;
    totalInvest: number;
    totalNbTickets: TicketCount;
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
    // Unbranded to match its actual upstream source (TimePeriodAccounting's
    // seasonInvestments, itself seasonStartYear: number) — see the same
    // reasoning on AskAmortization.remaining below.
    seasonStartYear: number;
};

export type AskPeriod = {
    realized: AskAccounting | null;
    unrealized: AskAccounting | null;
    pending: AskAccounting | null;
    seasonPasses: AskSeasonPass[];
    totalSeasonInvestment: TotalInvestment;
    // Bottom-line profit for this period: realized.totalProfit minus
    // realized.totalInvest minus totalSeasonInvestment. Null when there are
    // no realized sales, rather than a misleading zero. This is the
    // authoritative "profit" figure — realized.totalProfit is gross and
    // should never be stated as the user's profit on its own (see
    // SYSTEM_PROMPT).
    netProfit: Profit | null;
    leadTime: AskLeadTime | null;
};

export type AskAmortization = {
    passPrice: number;
    hasPass: boolean;
    totalRealized: number;
    progress: number;
    // Unbranded to match its actual source, Amortization.remaining in
    // src/api/accounting/types/amortization.type.ts, which is itself a plain
    // number — inventing a brand here would just be decoration, since the
    // real gap is upstream and out of this feature's scope to fix.
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
        startYear: SeasonYear;
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
