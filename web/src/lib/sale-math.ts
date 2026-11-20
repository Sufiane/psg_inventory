import type { Accounting, SaleListItem, SaleStatus } from './types';

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
