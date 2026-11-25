import type { SaleListItem } from './types';

export type ProceedsPoint = {
    at: Date;
    saleId: SaleListItem['id'];
    proceeds: number;
    cumulative: number;
};

export type ProceedsSeries = {
    points: ProceedsPoint[];
    undated: number;
    total: number;
    breakEven: ProceedsPoint | null;
};

export type PerTicketFigures = {
    avgTicketPrice: number | null;
    avgNetPerMatch: number | null;
    roi: number | null;
    net: number;
    costBase: number;
};

function toCents(value: number): number {
    return Math.round(value * 100) / 100;
}

function soldTime(sale: SaleListItem): number | null {
    if (sale.soldAt == null) {
        return null;
    }

    const time = new Date(sale.soldAt).getTime();

    return Number.isNaN(time) ? null : time;
}

export function proceedsSeries(sales: SaleListItem[], passPrice: number): ProceedsSeries {
    const dated: { sale: SaleListItem; time: number }[] = [];
    let undated = 0;

    for (const sale of sales) {
        if (sale.status !== 'SOLD') {
            continue;
        }

        const time = soldTime(sale);

        if (time === null) {
            undated += 1;
            continue;
        }

        dated.push({ sale, time });
    }

    dated.sort((left, right) => left.time - right.time);

    const points: ProceedsPoint[] = [];
    let cumulative = 0;
    let breakEven: ProceedsPoint | null = null;

    for (const { sale, time } of dated) {
        cumulative = toCents(cumulative + sale.profit);

        const point: ProceedsPoint = {
            at: new Date(time),
            saleId: sale.id,
            proceeds: sale.profit,
            cumulative,
        };

        points.push(point);

        if (breakEven === null && passPrice > 0 && cumulative >= passPrice) {
            breakEven = point;
        }
    }

    return { points, undated, total: cumulative, breakEven };
}

export function perTicketFigures(
    sales: SaleListItem[],
    seasonInvest: number,
): PerTicketFigures {
    const matchIds = new Set<string>();
    let listed = 0;
    let tickets = 0;
    let proceeds = 0;
    let invest = 0;

    for (const sale of sales) {
        if (sale.status !== 'SOLD') {
            continue;
        }

        listed += sale.listedPrice;
        tickets += sale.nbTickets;
        proceeds += sale.profit;
        invest += sale.invest;
        matchIds.add(sale.matchId);
    }

    const netBeforePass = proceeds - invest;
    const net = toCents(netBeforePass - seasonInvest);
    const costBase = invest + seasonInvest;

    return {
        avgTicketPrice: tickets > 0 ? listed / tickets : null,
        avgNetPerMatch: matchIds.size > 0 ? netBeforePass / matchIds.size : null,
        roi: costBase > 0 ? net / costBase : null,
        net,
        costBase,
    };
}
