import { dominantStatus, saleNet } from './sale-math';
import type { FormattedMatch, SaleListItem, SaleStatus } from './types';

export type MatchSummary = {
    status: SaleStatus | null;
    tickets: number;
    net: number;
};

export function matchSummary(sales: SaleListItem[]): MatchSummary {
    let tickets = 0;
    let net = 0;

    for (const sale of sales) {
        if (sale.status !== 'CANCELLED') {
            tickets += sale.nbTickets;
        }

        if (sale.status === 'SOLD') {
            net += saleNet(sale);
        }
    }

    return {
        status: dominantStatus(sales.map((sale) => sale.status)),
        tickets,
        net,
    };
}

export function displayScore(match: Pick<FormattedMatch, 'result'>): string | null {
    const score = match.result?.score;

    if (!score || score.includes('null')) {
        return null;
    }

    return score;
}
