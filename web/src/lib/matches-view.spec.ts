import { beforeEach, describe, expect, it } from 'vitest';
import { displayScore, matchSummary, type MatchSummary } from './matches-view';
import type { FormattedMatch, SaleListItem, SaleStatus } from './types';

function sale(status: SaleStatus, overrides: Partial<SaleListItem> = {}): SaleListItem {
    return {
        id: `sale-${status}`,
        matchId: 'match-1',
        listedPrice: 100,
        profit: 90,
        invest: 40,
        nbTickets: 2,
        status,
        opponent: { id: 'opp-1', name: 'Lyon' },
        Gift: null,
        ...overrides,
    } as SaleListItem;
}

describe('matchSummary', () => {
    describe('when a SOLD and a CANCELLED sale exist', () => {
        let summary: MatchSummary;

        beforeEach(() => {
            summary = matchSummary([
                sale('SOLD'),
                sale('CANCELLED', {
                    profit: 500,
                    invest: 10,
                    nbTickets: 3,
                } as Partial<SaleListItem>),
            ]);
        });

        it('reports SOLD as the status', () => {
            expect(summary.status).toBe('SOLD');
        });

        it('counts SOLD sales only in the net', () => {
            expect(summary.net).toBe(50);
        });

        it('leaves cancelled tickets out of the ticket count', () => {
            expect(summary.tickets).toBe(2);
        });
    });

    describe('when a PENDING and a SOLD sale exist', () => {
        let summary: MatchSummary;

        beforeEach(() => {
            summary = matchSummary([
                sale('PENDING', { nbTickets: 1 } as Partial<SaleListItem>),
                sale('SOLD'),
            ]);
        });

        it('counts pending tickets', () => {
            expect(summary.tickets).toBe(3);
        });

        it('leaves pending out of the net', () => {
            expect(summary.net).toBe(50);
        });
    });

    describe('when only a CANCELLED sale exists', () => {
        it('reports zero tickets and zero net', () => {
            const summary = matchSummary([sale('CANCELLED')]);

            expect(summary).toEqual({ status: 'CANCELLED', tickets: 0, net: 0 });
        });
    });

    describe('when there are no sales', () => {
        it('returns a null status and zeros', () => {
            expect(matchSummary([])).toEqual({ status: null, tickets: 0, net: 0 });
        });
    });
});

describe('displayScore', () => {
    function match(score: string | undefined): Pick<FormattedMatch, 'result'> {
        return { result: score === undefined ? undefined : { score } } as Pick<
            FormattedMatch,
            'result'
        >;
    }

    describe('when a score is present', () => {
        it('returns the score', () => {
            expect(displayScore(match('2-1'))).toBe('2-1');
        });
    });

    describe('when the score contains null', () => {
        it('returns null', () => {
            expect(displayScore(match('null-null'))).toBeNull();
        });
    });

    describe('when there is no result', () => {
        it('returns null', () => {
            expect(displayScore(match(undefined))).toBeNull();
        });
    });
});
