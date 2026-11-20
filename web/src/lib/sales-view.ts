import { saleNet } from './sale-math';
import type { SaleListItem, SaleStatus } from './types';

export type SaleSortKey = 'nbTickets' | 'listedPrice' | 'invest' | 'profit';
export type SaleSortDir = 'asc' | 'desc';
export type StatusFilter = SaleStatus | 'all';
export type StatusTab = { href: string; label: string; active: boolean };

const STATUSES: SaleStatus[] = ['PENDING', 'SOLD', 'CANCELLED', 'GIFTED'];

const TAB_LABELS: { filter: StatusFilter; label: string }[] = [
    { filter: 'all', label: 'All' },
    { filter: 'PENDING', label: 'Pending' },
    { filter: 'SOLD', label: 'Sold' },
    { filter: 'CANCELLED', label: 'Cancelled' },
    { filter: 'GIFTED', label: 'Gifted' },
];

export function parseStatusParam(url: URL): StatusFilter {
    const raw = url.searchParams.get('status')?.toUpperCase();

    return STATUSES.find((status) => status === raw) ?? 'all';
}

export function filterByStatus(
    sales: SaleListItem[],
    status: StatusFilter,
    keepId: string | null,
): SaleListItem[] {
    if (status === 'all') {
        return sales;
    }

    return sales.filter((sale) => sale.status === status || sale.id === keepId);
}

export function pendingFirst(sales: SaleListItem[]): SaleListItem[] {
    const pending: SaleListItem[] = [];
    const rest: SaleListItem[] = [];

    for (const sale of sales) {
        if (sale.status === 'PENDING') {
            pending.push(sale);
        } else {
            rest.push(sale);
        }
    }

    return [...pending, ...rest];
}

function sortValue(sale: SaleListItem, key: SaleSortKey): number {
    return key === 'profit' ? saleNet(sale) : sale[key];
}

export function sortSales(
    sales: SaleListItem[],
    key: SaleSortKey | null,
    dir: SaleSortDir,
): SaleListItem[] {
    if (key === null) {
        return sales;
    }

    const factor = dir === 'asc' ? 1 : -1;

    return [...sales].sort(
        (first, second) => (sortValue(first, key) - sortValue(second, key)) * factor,
    );
}

export function statusTabs(url: URL): StatusTab[] {
    const current = parseStatusParam(url);

    return TAB_LABELS.map(({ filter, label }) => {
        const params = new URLSearchParams(url.searchParams);

        params.delete('edit');
        params.delete('new');

        if (filter === 'all') {
            params.delete('status');
        } else {
            params.set('status', filter.toLowerCase());
        }

        const query = params.toString();

        return {
            href: query ? `/sales?${query}` : '/sales',
            label,
            active: filter === current,
        };
    });
}
