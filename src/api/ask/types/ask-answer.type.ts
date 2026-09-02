import type { TicketCount } from '@psg/shared/counts';
import type { Profit, TotalInvestment, TotalListedValue } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';

export type AskFigures = {
    seasonStartYear: SeasonYear;
    currentSeasonProfit: Profit | null;
    currentSeasonSales: TotalListedValue | null;
    currentSeasonTickets: TicketCount | null;
    allTimeProfit: Profit | null;
    allTimeSales: TotalListedValue | null;
    pendingSales: TotalListedValue | null;
    totalSeasonInvestment: TotalInvestment;
    // Amortization.remaining is unbranded upstream (src/api/accounting/types/
    // amortization.type.ts) — left as a plain number here to match its actual
    // source rather than inventing a brand this feature doesn't own.
    amortizationRemaining: number;
    brokeEven: boolean;
};

export type AskAnswer = {
    question: string;
    answer: string;
    figures: AskFigures;
    generatedAt: string;
};
