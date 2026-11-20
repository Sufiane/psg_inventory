import { money } from '$lib/format';
import type { Amortization, SaleListItem } from '$lib/types';

function recencyOf(sale: SaleListItem): number {
    const stamp = sale.createdAt ?? sale.matchDate;
    const time = stamp === undefined ? Number.NaN : new Date(stamp).getTime();

    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

export function recentSales(sales: SaleListItem[], limit: number): SaleListItem[] {
    return sales
        .map((sale) => ({ sale, recency: recencyOf(sale) }))
        .sort((left, right) => {
            if (left.recency === right.recency) {
                return 0;
            }

            return left.recency > right.recency ? -1 : 1;
        })
        .slice(0, limit)
        .map((entry) => entry.sale);
}

export function breakEvenCaption(
    amortization: Pick<Amortization, 'hasPass' | 'remaining' | 'surplus'>,
): string | null {
    if (!amortization.hasPass) {
        return null;
    }

    if (amortization.remaining > 0) {
        return `${money(amortization.remaining)} still to recover`;
    }

    if (amortization.surplus > 0) {
        return `Pass recovered, ${money(amortization.surplus)} surplus`;
    }

    return 'Pass recovered';
}

export function netTone(value: number): string {
    if (value < 0) {
        return 'text-negative-strong';
    }

    if (value > 0) {
        return 'text-positive-strong';
    }

    return 'text-ink';
}
