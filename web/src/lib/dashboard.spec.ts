import { describe, expect, it } from 'vitest';
import { breakEvenCaption, netTone, recentSales } from './dashboard';
import { money } from './format';
import type { SaleListItem } from './types';

function sale(id: string, overrides: Partial<Record<string, unknown>> = {}): SaleListItem {
    return {
        id,
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
    return sales.map((item) => item.id as string);
}

describe('recentSales', () => {
    describe('when sales have createdAt', () => {
        it('returns the newest first', () => {
            const sales = [
                sale('old', { createdAt: '2026-01-01T00:00:00Z' }),
                sale('new', { createdAt: '2026-03-01T00:00:00Z' }),
                sale('mid', { createdAt: '2026-02-01T00:00:00Z' }),
            ];

            expect(ids(recentSales(sales, 5))).toEqual(['new', 'mid', 'old']);
        });
    });

    describe('when createdAt is missing', () => {
        it('falls back to matchDate', () => {
            const sales = [
                sale('early', { matchDate: '2026-01-01T00:00:00Z' }),
                sale('late', { matchDate: '2026-03-01T00:00:00Z' }),
            ];

            expect(ids(recentSales(sales, 5))).toEqual(['late', 'early']);
        });
    });

    describe('when both dates are missing', () => {
        it('keeps them last in input order', () => {
            const sales = [
                sale('bare-1'),
                sale('dated', { createdAt: '2026-01-01T00:00:00Z' }),
                sale('bare-2'),
            ];

            expect(ids(recentSales(sales, 5))).toEqual(['dated', 'bare-1', 'bare-2']);
        });
    });

    describe('when createdAt is unparseable', () => {
        it('sorts it last in input order', () => {
            const sales = [
                sale('bad-1', { createdAt: 'not-a-date' }),
                sale('dated', { createdAt: '2026-01-01T00:00:00Z' }),
                sale('bad-2', { createdAt: 'nope' }),
            ];

            expect(ids(recentSales(sales, 5))).toEqual(['dated', 'bad-1', 'bad-2']);
        });
    });

    describe('when there are more sales than the limit', () => {
        it('truncates to the limit', () => {
            const sales = [
                sale('a', { createdAt: '2026-01-03T00:00:00Z' }),
                sale('b', { createdAt: '2026-01-02T00:00:00Z' }),
                sale('c', { createdAt: '2026-01-01T00:00:00Z' }),
            ];

            expect(ids(recentSales(sales, 2))).toEqual(['a', 'b']);
        });
    });

    describe('when the list is empty', () => {
        it('returns an empty list', () => {
            expect(recentSales([], 5)).toEqual([]);
        });
    });

    describe('when called', () => {
        it('does not mutate the input', () => {
            const sales = [
                sale('old', { createdAt: '2026-01-01T00:00:00Z' }),
                sale('new', { createdAt: '2026-03-01T00:00:00Z' }),
            ];

            recentSales(sales, 5);

            expect(ids(sales)).toEqual(['old', 'new']);
        });
    });
});

describe('breakEvenCaption', () => {
    describe('when there is no pass', () => {
        it('returns null', () => {
            expect(
                breakEvenCaption({ hasPass: false, remaining: 0, surplus: 0 }),
            ).toBeNull();
        });
    });

    describe('when remaining is positive', () => {
        it('states the amount still to recover', () => {
            expect(
                breakEvenCaption({ hasPass: true, remaining: 250, surplus: 0 }),
            ).toBe(`${money(250)} still to recover`);
        });
    });

    describe('when remaining is 0 and surplus is positive', () => {
        it('states the surplus', () => {
            expect(
                breakEvenCaption({ hasPass: true, remaining: 0, surplus: 80 }),
            ).toBe(`Pass recovered, ${money(80)} surplus`);
        });
    });

    describe('when remaining and surplus are both 0', () => {
        it('states the pass is recovered', () => {
            expect(breakEvenCaption({ hasPass: true, remaining: 0, surplus: 0 })).toBe(
                'Pass recovered',
            );
        });
    });
});

describe('netTone', () => {
    describe('when the value is negative', () => {
        it('returns the negative tone', () => {
            expect(netTone(-1)).toBe('text-negative-strong');
        });
    });

    describe('when the value is positive', () => {
        it('returns the positive tone', () => {
            expect(netTone(1)).toBe('text-positive-strong');
        });
    });

    describe('when the value is zero', () => {
        it('returns the neutral tone', () => {
            expect(netTone(0)).toBe('text-ink');
        });
    });
});
