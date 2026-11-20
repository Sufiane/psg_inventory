import { describe, expect, it } from 'vitest';
import {
    filterByStatus,
    parseStatusParam,
    pendingFirst,
    sortSales,
    statusTabs,
} from './sales-view';
import type { SaleListItem } from './types';

function sale(overrides: Partial<Record<string, unknown>> = {}): SaleListItem {
    return {
        id: 'sale-1',
        matchId: 'match-1',
        listedPrice: 100,
        profit: 60,
        invest: 40,
        nbTickets: 2,
        status: 'SOLD',
        opponent: { id: 'opp-1', name: 'Lyon' },
        Gift: null,
        ...overrides,
    } as unknown as SaleListItem;
}

function ids(sales: SaleListItem[]): string[] {
    return sales.map((row) => row.id);
}

describe('parseStatusParam', () => {
    describe('when the param is lower case gifted', () => {
        it('returns GIFTED', () => {
            expect(parseStatusParam(new URL('http://x/sales?status=gifted'))).toBe('GIFTED');
        });
    });

    describe('when the param is invalid', () => {
        it('returns all', () => {
            expect(parseStatusParam(new URL('http://x/sales?status=nope'))).toBe('all');
        });
    });

    describe('when the param is absent', () => {
        it('returns all', () => {
            expect(parseStatusParam(new URL('http://x/sales'))).toBe('all');
        });
    });
});

describe('filterByStatus', () => {
    const rows = [
        sale({ id: 'a', status: 'PENDING' }),
        sale({ id: 'b', status: 'SOLD' }),
        sale({ id: 'c', status: 'CANCELLED' }),
        sale({ id: 'd', status: 'SOLD' }),
    ];

    describe('when status is all', () => {
        it('returns the input rows', () => {
            expect(ids(filterByStatus(rows, 'all', null))).toEqual(['a', 'b', 'c', 'd']);
        });
    });

    describe('when status is SOLD', () => {
        it('returns only SOLD rows', () => {
            expect(ids(filterByStatus(rows, 'SOLD', null))).toEqual(['b', 'd']);
        });
    });

    describe('when keepId is a PENDING row and status is SOLD', () => {
        it('includes the kept row in original order', () => {
            expect(ids(filterByStatus(rows, 'SOLD', 'a'))).toEqual(['a', 'b', 'd']);
        });
    });

    describe('when keepId is null', () => {
        it('adds no extra rows', () => {
            expect(ids(filterByStatus(rows, 'CANCELLED', null))).toEqual(['c']);
        });
    });
});

describe('pendingFirst', () => {
    describe('when statuses are mixed', () => {
        it('puts PENDING rows first and keeps relative order', () => {
            const rows = [
                sale({ id: 'a', status: 'SOLD' }),
                sale({ id: 'b', status: 'PENDING' }),
                sale({ id: 'c', status: 'CANCELLED' }),
                sale({ id: 'd', status: 'PENDING' }),
            ];

            expect(ids(pendingFirst(rows))).toEqual(['b', 'd', 'a', 'c']);
        });

        it('does not mutate the input', () => {
            const rows = [
                sale({ id: 'a', status: 'SOLD' }),
                sale({ id: 'b', status: 'PENDING' }),
            ];

            pendingFirst(rows);

            expect(ids(rows)).toEqual(['a', 'b']);
        });
    });

    describe('when the list is empty', () => {
        it('returns an empty list', () => {
            expect(pendingFirst([])).toEqual([]);
        });
    });
});

describe('sortSales', () => {
    const rows = [
        sale({ id: 'a', listedPrice: 50, profit: 90, invest: 80 }),
        sale({ id: 'b', listedPrice: 30, profit: 40, invest: 0 }),
        sale({ id: 'c', listedPrice: 40, profit: 60, invest: 30 }),
    ];

    describe('when key is null', () => {
        it('returns the input order', () => {
            expect(ids(sortSales(rows, null, 'desc'))).toEqual(['a', 'b', 'c']);
        });
    });

    describe('when key is profit', () => {
        it('orders by net, not raw profit', () => {
            expect(ids(sortSales(rows, 'profit', 'desc'))).toEqual(['b', 'c', 'a']);
        });
    });

    describe('when dir is asc', () => {
        it('orders ascending', () => {
            expect(ids(sortSales(rows, 'listedPrice', 'asc'))).toEqual(['b', 'c', 'a']);
        });
    });

    describe('when sorting', () => {
        it('does not mutate the input', () => {
            sortSales(rows, 'listedPrice', 'asc');

            expect(ids(rows)).toEqual(['a', 'b', 'c']);
        });
    });
});

describe('statusTabs', () => {
    describe('when the url has year and edit', () => {
        it('keeps year and drops edit and new on every tab', () => {
            const tabs = statusTabs(new URL('http://x/sales?year=2025&edit=abc&new=1'));

            for (const tab of tabs) {
                expect(tab.href).toContain('year=2025');
                expect(tab.href).not.toContain('edit');
                expect(tab.href).not.toContain('new');
            }
        });
    });

    describe('when status is sold', () => {
        it('marks only the Sold tab active with a lower case status href', () => {
            const tabs = statusTabs(new URL('http://x/sales?status=sold'));

            expect(tabs.filter((tab) => tab.active).map((tab) => tab.label)).toEqual(['Sold']);
            expect(tabs.find((tab) => tab.label === 'Sold')?.href).toContain('status=sold');
        });
    });

    describe('when there is no status', () => {
        it('marks All active and gives it an href without status', () => {
            const tabs = statusTabs(new URL('http://x/sales'));
            const all = tabs.find((tab) => tab.label === 'All');

            expect(all?.active).toBe(true);
            expect(all?.href).toBe('/sales');
        });
    });

    describe('when listing tabs', () => {
        it('orders labels All, Pending, Sold, Cancelled, Gifted', () => {
            const tabs = statusTabs(new URL('http://x/sales'));

            expect(tabs.map((tab) => tab.label)).toEqual([
                'All',
                'Pending',
                'Sold',
                'Cancelled',
                'Gifted',
            ]);
        });

        it('points every href at /sales', () => {
            const tabs = statusTabs(new URL('http://x/sales?year=all'));

            for (const tab of tabs) {
                expect(tab.href.startsWith('/sales')).toBe(true);
            }
        });
    });
});
