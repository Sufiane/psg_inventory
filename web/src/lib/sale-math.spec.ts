import { describe, expect, it } from 'vitest';
import {
    cancelledFrom,
    dominantStatus,
    groupSalesByMatch,
    realizedFigures,
    realizedNet,
    saleNet,
    summarizeSales,
} from './sale-math';
import type { Accounting, SaleListItem, SaleStatus, TimePeriodAccounting } from './types';

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

function accounting(totalSales: number, totalProfit: number): Accounting {
    return { totalSales, totalProfit } as unknown as Accounting;
}

describe('saleNet', () => {
    describe('when profit exceeds invest', () => {
        it('returns the positive difference', () => {
            expect(saleNet({ profit: 100, invest: 40 } as SaleListItem)).toBe(60);
        });
    });

    describe('when invest exceeds profit', () => {
        it('returns a negative number', () => {
            expect(saleNet({ profit: 10, invest: 40 } as SaleListItem)).toBe(-30);
        });
    });
});

describe('summarizeSales', () => {
    describe('when a PENDING and a SOLD sale are given', () => {
        const summary = summarizeSales([
            sale({ status: 'SOLD', profit: 100, invest: 30, nbTickets: 2 }),
            sale({ id: 'sale-2', status: 'PENDING', profit: 50, invest: 20, nbTickets: 3 }),
        ]);

        it('counts proceeds from SOLD rows only', () => {
            expect(summary.proceedsSold).toBe(100);
        });

        it('counts invest from SOLD rows only', () => {
            expect(summary.investSold).toBe(30);
        });

        it('computes net from SOLD rows only', () => {
            expect(summary.netSold).toBe(70);
        });

        it('counts tickets from all rows', () => {
            expect(summary.tickets).toBe(5);
        });

        it('splits tickets by status', () => {
            expect(summary.ticketsByStatus).toEqual({
                PENDING: 3,
                SOLD: 2,
                CANCELLED: 0,
                GIFTED: 0,
            });
        });
    });

    describe('when no sales are given', () => {
        it('returns all zeros', () => {
            expect(summarizeSales([])).toEqual({
                tickets: 0,
                ticketsByStatus: { PENDING: 0, SOLD: 0, CANCELLED: 0, GIFTED: 0 },
                proceedsSold: 0,
                investSold: 0,
                netSold: 0,
            });
        });
    });
});

describe('dominantStatus', () => {
    describe('when SOLD and CANCELLED coexist', () => {
        it('returns SOLD', () => {
            expect(dominantStatus(['CANCELLED', 'SOLD'])).toBe('SOLD');
        });
    });

    describe('when PENDING and GIFTED coexist', () => {
        it('returns PENDING', () => {
            expect(dominantStatus(['GIFTED', 'PENDING'])).toBe('PENDING');
        });
    });

    describe('when only GIFTED and CANCELLED are given', () => {
        it('returns GIFTED', () => {
            expect(dominantStatus(['CANCELLED', 'GIFTED'])).toBe('GIFTED');
        });
    });

    describe('when only CANCELLED is given', () => {
        it('returns CANCELLED', () => {
            const statuses: SaleStatus[] = ['CANCELLED'];

            expect(dominantStatus(statuses)).toBe('CANCELLED');
        });
    });

    describe('when empty', () => {
        it('returns null', () => {
            expect(dominantStatus([])).toBeNull();
        });
    });
});

describe('groupSalesByMatch', () => {
    describe('when two sales share a matchId', () => {
        it('groups them together', () => {
            const grouped = groupSalesByMatch([
                sale({ id: 'a', matchId: 'm1' }),
                sale({ id: 'b', matchId: 'm1' }),
                sale({ id: 'c', matchId: 'm2' }),
            ]);

            expect(Object.keys(grouped)).toEqual(['m1', 'm2']);
            expect(grouped['m1']).toHaveLength(2);
            expect(grouped['m2']).toHaveLength(1);
        });
    });

    describe('when empty', () => {
        it('returns an empty object', () => {
            expect(groupSalesByMatch([])).toEqual({});
        });
    });
});

describe('cancelledFrom', () => {
    describe('when gifted is a subset of unrealized', () => {
        it('subtracts count and amount', () => {
            expect(cancelledFrom(accounting(5, -120), accounting(2, -40))).toEqual({
                count: 3,
                amount: -80,
            });
        });
    });

    describe('when gifted is null', () => {
        it('returns unrealized as is', () => {
            expect(cancelledFrom(accounting(5, -120), null)).toEqual({
                count: 5,
                amount: -120,
            });
        });
    });

    describe('when both are null', () => {
        it('returns zeros', () => {
            expect(cancelledFrom(null, null)).toEqual({ count: 0, amount: 0 });
        });
    });
});

describe('realizedNet', () => {
    function period(realized: Accounting | null): TimePeriodAccounting {
        return { realized, totalSeasonInvestment: 100 } as unknown as TimePeriodAccounting;
    }

    describe('when realized sales exist', () => {
        it('subtracts invest and season investment from proceeds', () => {
            const realized = { totalProfit: 500, totalInvest: 150 } as unknown as Accounting;

            expect(realizedNet(period(realized))).toBe(250);
        });
    });

    describe('when realized is null', () => {
        it('returns the negative season investment', () => {
            expect(realizedNet(period(null))).toBe(-100);
        });
    });
});

describe('realizedFigures', () => {
    function period(realized: Accounting | null): TimePeriodAccounting {
        return { realized, totalSeasonInvestment: 100 } as unknown as TimePeriodAccounting;
    }

    describe('when realized sales exist', () => {
        it('returns proceeds, invest, season invest and net', () => {
            const realized = { totalProfit: 500, totalInvest: 150 } as unknown as Accounting;

            expect(realizedFigures(period(realized))).toEqual({
                proceeds: 500,
                invest: 150,
                seasonInvest: 100,
                net: 250,
            });
        });
    });

    describe('when realized is null', () => {
        it('returns zero proceeds and invest with negative net', () => {
            expect(realizedFigures(period(null))).toEqual({
                proceeds: 0,
                invest: 0,
                seasonInvest: 100,
                net: -100,
            });
        });
    });
});
