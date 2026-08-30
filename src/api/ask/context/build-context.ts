import type { Amortization } from '../../accounting/types/amortization.type';
import type { MaxMinData } from '../../accounting/types/accounting.type';
import type { TimePeriodAccounting } from '../../accounting/types/time-period-accounting.type';
import type { FormattedMatch } from '../../matches/types/formatted-match.type';
import type {
    AskAccounting,
    AskContext,
    AskExtreme,
    AskPeriod,
    AskPlayedMatch,
    AskUpcomingMatch,
} from '../types/context.type';

export type BuildAskContextInput = {
    currentSeason: TimePeriodAccounting;
    allTime: TimePeriodAccounting;
    amortization: Amortization;
    matches: FormattedMatch[];
    seasonWindow: { start: Date; end: Date };
    generatedAt: Date;
};

function toExtreme(raw: MaxMinData | null | undefined): AskExtreme | null {
    if (raw == null) {
        return null;
    }

    return {
        price: raw.price,
        profit: raw.profit,
        opponent: raw.match.opponent,
        date: new Date(raw.match.date).toISOString(),
        atHome: raw.match.atHome,
        competition: raw.match.competition,
    };
}

// Field-by-field allow-list, never a spread of the service result. This is what
// guarantees no identity field can reach the model, and that adding a column to
// Accounting later cannot silently widen what leaves the process.
function toAccounting(raw: TimePeriodAccounting['realized']): AskAccounting | null {
    if (raw == null) {
        return null;
    }

    return {
        // raw.totalSales is a pre-existing misnomer upstream (it's actually
        // SUM(listedPrice), not a count — see
        // format-aggregate.util.ts). Renamed as it crosses into AskContext
        // so the model isn't handed a field that reads like a count.
        totalListedValue: raw.totalSales,
        totalProfit: raw.totalProfit,
        totalInvest: raw.totalInvest,
        totalNbTickets: raw.totalNbTickets,
        averageTicketPrice: raw.averageTicketPrice,
        averageProfit: raw.averageProfit,
        highest: toExtreme(raw.highest),
        lowest: toExtreme(raw.lowest),
    };
}

// "Profit" everywhere else in this app means net profit: realized profit
// minus what was spent to realize it and minus the season pass cost (see
// web/src/routes/+page.server.ts). realized.totalProfit is gross, so
// exposing it as "profit" would read as contradicting the amortization/
// break-even figures for the same season. Null when there are no realized
// sales, rather than a misleading zero.
function toNetProfit(
    realized: AskAccounting | null,
    totalSeasonInvestment: number,
): number | null {
    if (realized == null) {
        return null;
    }

    return realized.totalProfit - realized.totalInvest - totalSeasonInvestment;
}

function toPeriod(period: TimePeriodAccounting): AskPeriod {
    const realized = toAccounting(period.realized);

    return {
        realized,
        unrealized: toAccounting(period.unrealized),
        pending: toAccounting(period.pending),
        seasonPasses: period.seasonInvestments.map((pass) => ({
            label: pass.label,
            category: pass.category,
            price: pass.price,
            seasonStartYear: pass.seasonStartYear,
        })),
        totalSeasonInvestment: period.totalSeasonInvestment,
        netProfit: toNetProfit(realized, period.totalSeasonInvestment),
        leadTime:
            period.leadTime == null
                ? null
                : {
                      soldCount: period.leadTime.soldCount,
                      avgLeadDays: period.leadTime.avgLeadDays,
                      medianLeadDays: period.leadTime.medianLeadDays,
                      minLeadDays: period.leadTime.minLeadDays,
                      maxLeadDays: period.leadTime.maxLeadDays,
                  },
    };
}

export function buildAskContext(input: BuildAskContextInput): AskContext {
    const now = input.generatedAt.getTime();
    const played: AskPlayedMatch[] = [];
    const upcoming: AskUpcomingMatch[] = [];

    for (const match of input.matches) {
        const date = new Date(match.date).toISOString();

        if (new Date(match.date).getTime() <= now) {
            played.push({
                date,
                opponent: match.opponent,
                atHome: match.atHome,
                competition: match.competition,
                score: match.result?.score,
                isWin: match.result?.isWin,
            });

            continue;
        }

        upcoming.push({
            date,
            opponent: match.opponent,
            atHome: match.atHome,
            competition: match.competition,
        });
    }

    return {
        generatedAt: input.generatedAt.toISOString(),
        currency: 'EUR',
        season: {
            startYear: input.seasonWindow.start.getUTCFullYear(),
            startDate: input.seasonWindow.start.toISOString(),
            endDate: input.seasonWindow.end.toISOString(),
        },
        currentSeason: toPeriod(input.currentSeason),
        allTime: toPeriod(input.allTime),
        amortization: {
            passPrice: input.amortization.passPrice,
            hasPass: input.amortization.hasPass,
            totalRealized: input.amortization.totalRealized,
            progress: input.amortization.progress,
            remaining: input.amortization.remaining,
            surplus: input.amortization.surplus,
            brokeEven: input.amortization.breakEven != null,
        },
        matches: { played, upcoming },
    };
}
