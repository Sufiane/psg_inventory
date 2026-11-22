import type { Accounting, SaleListItem, SaleStatus, TimePeriodAccounting } from './types';

export type SalesSummary = {
    tickets: number;
    ticketsByStatus: Record<SaleStatus, number>;
    proceedsSold: number;
    investSold: number;
    netSold: number;
};

const STATUS_PRECEDENCE: SaleStatus[] = ['SOLD', 'PENDING', 'GIFTED', 'CANCELLED'];

export function saleNet(sale: Pick<SaleListItem, 'profit' | 'invest'>): number {
    return sale.profit - sale.invest;
}

export type SaleProfitBreakdown = {
    listedPrice: number;
    commission: number;
    proceeds: number;
    invest: number;
    net: number;
};

// Same expression and operation order as the backend's computeProfit, so
// `proceeds` is bit-identical to the stored `Sales.profit` and `net` to saleNet.
export function computeSaleBreakdown(
    sale: { listedPrice: number; invest: number },
    commissionPercent: number,
): SaleProfitBreakdown {
    const proceeds = (sale.listedPrice * (100 - commissionPercent)) / 100;

    return {
        listedPrice: sale.listedPrice,
        commission: sale.listedPrice - proceeds,
        proceeds,
        invest: sale.invest,
        net: proceeds - sale.invest,
    };
}

export function computeDraftBreakdown(
    listedPrice: number | null,
    invest: number | null,
    commissionPercent: number,
): SaleProfitBreakdown | null {
    if (
        listedPrice === null ||
        !Number.isInteger(listedPrice) ||
        listedPrice < 1 ||
        (invest !== null && (!Number.isInteger(invest) || invest < 0))
    ) {
        return null;
    }

    return computeSaleBreakdown({ listedPrice, invest: invest ?? 0 }, commissionPercent);
}

export function parseAmount(raw: string): number | null {
    if (raw.trim() === '') {
        return null;
    }

    const value = Number(raw);

    return Number.isInteger(value) ? value : null;
}

export function summarizeSales(sales: SaleListItem[]): SalesSummary {
    const summary: SalesSummary = {
        tickets: 0,
        ticketsByStatus: { PENDING: 0, SOLD: 0, CANCELLED: 0, GIFTED: 0 },
        proceedsSold: 0,
        investSold: 0,
        netSold: 0,
    };

    for (const sale of sales) {
        summary.tickets += sale.nbTickets;
        summary.ticketsByStatus[sale.status] += sale.nbTickets;

        if (sale.status === 'SOLD') {
            summary.proceedsSold += sale.profit;
            summary.investSold += sale.invest;
        }
    }

    summary.netSold = summary.proceedsSold - summary.investSold;

    return summary;
}

export function dominantStatus(statuses: SaleStatus[]): SaleStatus | null {
    return STATUS_PRECEDENCE.find((status) => statuses.includes(status)) ?? null;
}

export function groupSalesByMatch(sales: SaleListItem[]): Record<string, SaleListItem[]> {
    const groups: Record<string, SaleListItem[]> = {};

    for (const sale of sales) {
        (groups[sale.matchId] ??= []).push(sale);
    }

    return groups;
}

export function cancelledFrom(
    unrealized: Accounting | null,
    gifted: Accounting | null,
): { count: number; amount: number } {
    return {
        count: (unrealized?.totalSales ?? 0) - (gifted?.totalSales ?? 0),
        amount: (unrealized?.totalProfit ?? 0) - (gifted?.totalProfit ?? 0),
    };
}

export type RealizedFigures = {
    proceeds: number;
    invest: number;
    seasonInvest: number;
    net: number;
};

export function realizedFigures(
    accounting: Pick<TimePeriodAccounting, 'realized' | 'totalSeasonInvestment'>,
): RealizedFigures {
    const proceeds = accounting.realized?.totalProfit ?? 0;
    const invest = accounting.realized?.totalInvest ?? 0;
    const seasonInvest = accounting.totalSeasonInvestment;

    return { proceeds, invest, seasonInvest, net: proceeds - invest - seasonInvest };
}

export function realizedNet(
    accounting: Pick<TimePeriodAccounting, 'realized' | 'totalSeasonInvestment'>,
): number {
    return realizedFigures(accounting).net;
}
