import { describe, expect, it } from 'vitest';
import type { MatchId } from '@psg/shared/ids';
import { perTicketFigures, proceedsSeries } from './season-stats';
import type { SaleListItem, SaleStatus } from './types';

type SaleOverrides = {
    id?: string;
    matchId?: string;
    status?: SaleStatus;
    listedPrice?: number;
    profit?: number;
    invest?: number;
    nbTickets?: number;
    soldAt?: string | null;
};

function sale(overrides: SaleOverrides): SaleListItem {
    return {
        id: (overrides.id ?? 's1') as SaleListItem['id'],
        matchId: (overrides.matchId ?? 'm1') as MatchId,
        listedPrice: (overrides.listedPrice ?? 100) as SaleListItem['listedPrice'],
        profit: (overrides.profit ?? 90) as SaleListItem['profit'],
        invest: (overrides.invest ?? 0) as SaleListItem['invest'],
        nbTickets: (overrides.nbTickets ?? 1) as SaleListItem['nbTickets'],
        status: overrides.status ?? 'SOLD',
        opponent: { id: 'op1' as SaleListItem['opponent']['id'], name: 'Rival FC' as SaleListItem['opponent']['name'] },
        soldAt: overrides.soldAt === undefined ? '2026-09-01T10:00:00.000Z' : overrides.soldAt,
        Gift: null,
    };
}

describe('proceedsSeries', () => {
    describe('when there are no sales', () => {
        it('returns an empty series', () => {
            const series = proceedsSeries([], 500);

            expect(series.points).toEqual([]);
            expect(series.undated).toBe(0);
            expect(series.total).toBe(0);
            expect(series.breakEven).toBeNull();
        });
    });

    describe('when sales are out of order', () => {
        it('orders points by sold date and accumulates proceeds', () => {
            const series = proceedsSeries(
                [
                    sale({ id: 'late', profit: 30, soldAt: '2026-10-01T10:00:00.000Z' }),
                    sale({ id: 'early', profit: 10, soldAt: '2026-09-01T10:00:00.000Z' }),
                ],
                500,
            );

            expect(series.points.map((point) => point.saleId)).toEqual(['early', 'late']);
            expect(series.points.map((point) => point.cumulative)).toEqual([10, 40]);
            expect(series.total).toBe(40);
        });
    });

    describe('when sales are not SOLD', () => {
        it('ignores pending, gifted and cancelled sales', () => {
            const series = proceedsSeries(
                [
                    sale({ id: 'p', status: 'PENDING' }),
                    sale({ id: 'g', status: 'GIFTED' }),
                    sale({ id: 'c', status: 'CANCELLED' }),
                ],
                500,
            );

            expect(series.points).toEqual([]);
            expect(series.undated).toBe(0);
        });
    });

    describe('when a SOLD sale has no valid sold date', () => {
        it('counts it as undated and leaves it out of the points', () => {
            const series = proceedsSeries(
                [
                    sale({ id: 'null', soldAt: null }),
                    sale({ id: 'bad', soldAt: 'not-a-date' }),
                    sale({ id: 'ok', profit: 25 }),
                ],
                500,
            );

            expect(series.undated).toBe(2);
            expect(series.points).toHaveLength(1);
            expect(series.total).toBe(25);
        });
    });

    describe('when cumulative proceeds reach the pass price', () => {
        it('marks the first crossing point as break-even', () => {
            const series = proceedsSeries(
                [
                    sale({ id: 'a', profit: 60, soldAt: '2026-09-01T10:00:00.000Z' }),
                    sale({ id: 'b', profit: 40, soldAt: '2026-09-02T10:00:00.000Z' }),
                    sale({ id: 'c', profit: 50, soldAt: '2026-09-03T10:00:00.000Z' }),
                ],
                100,
            );

            expect(series.breakEven?.saleId).toBe('b');
        });
    });

    describe('when cumulative proceeds never reach the pass price', () => {
        it('has no break-even point', () => {
            const series = proceedsSeries([sale({ profit: 20 })], 100);

            expect(series.breakEven).toBeNull();
        });
    });

    describe('when the pass price is 0', () => {
        it('has no break-even point', () => {
            const series = proceedsSeries([sale({ profit: 20 })], 0);

            expect(series.breakEven).toBeNull();
        });
    });

    describe('when proceeds are fractional', () => {
        it('rounds the running total to cents', () => {
            const series = proceedsSeries(
                [
                    sale({ id: 'a', profit: 0.1, soldAt: '2026-09-01T10:00:00.000Z' }),
                    sale({ id: 'b', profit: 0.2, soldAt: '2026-09-02T10:00:00.000Z' }),
                ],
                0.3,
            );

            expect(series.total).toBe(0.3);
            expect(series.breakEven?.saleId).toBe('b');
        });
    });
});

describe('perTicketFigures', () => {
    describe('when there are no SOLD sales', () => {
        it('returns null figures and a zero net', () => {
            const figures = perTicketFigures([sale({ status: 'PENDING' })], 0);

            expect(figures.avgTicketPrice).toBeNull();
            expect(figures.avgNetPerMatch).toBeNull();
            expect(figures.roi).toBeNull();
            expect(figures.net).toBe(0);
        });
    });

    describe('when a sale has several tickets', () => {
        it('divides total listed price by total tickets', () => {
            const figures = perTicketFigures(
                [
                    sale({ id: 'a', listedPrice: 200, nbTickets: 2 }),
                    sale({ id: 'b', matchId: 'm2', listedPrice: 100, nbTickets: 1 }),
                ],
                0,
            );

            expect(figures.avgTicketPrice).toBe(100);
        });
    });

    describe('when two sales share a match', () => {
        it('averages net over distinct matches', () => {
            const figures = perTicketFigures(
                [
                    sale({ id: 'a', matchId: 'm1', profit: 90, invest: 10 }),
                    sale({ id: 'b', matchId: 'm1', profit: 50, invest: 0 }),
                    sale({ id: 'c', matchId: 'm2', profit: 30, invest: 0 }),
                ],
                0,
            );

            expect(figures.avgNetPerMatch).toBe(80);
        });
    });

    describe('when there is a season pass and ticket invest', () => {
        it('computes ROI as net over invest plus pass', () => {
            const figures = perTicketFigures(
                [sale({ profit: 400, invest: 100 })],
                100,
            );

            expect(figures.net).toBe(200);
            expect(figures.costBase).toBe(200);
            expect(figures.roi).toBe(1);
        });
    });

    describe('when net is negative', () => {
        it('returns a negative ROI', () => {
            const figures = perTicketFigures([sale({ profit: 50, invest: 0 })], 100);

            expect(figures.roi).toBe(-0.5);
        });
    });

    describe('when there is no ticket invest and no season pass', () => {
        it('returns a null ROI', () => {
            const figures = perTicketFigures([sale({ profit: 50, invest: 0 })], 0);

            expect(figures.costBase).toBe(0);
            expect(figures.roi).toBeNull();
        });
    });

    describe('when sales are not SOLD', () => {
        it('excludes them from every figure', () => {
            const figures = perTicketFigures(
                [
                    sale({ id: 'a', profit: 90 }),
                    sale({ id: 'b', matchId: 'm2', status: 'GIFTED', listedPrice: 0, profit: 0, nbTickets: 4 }),
                ],
                0,
            );

            expect(figures.avgTicketPrice).toBe(100);
            expect(figures.avgNetPerMatch).toBe(90);
        });
    });
});
