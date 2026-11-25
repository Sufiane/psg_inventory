import { describe, expect, it } from 'vitest';
import { buildGeometry, type ChartBox } from './chart-geometry';
import type { ProceedsPoint, ProceedsSeries } from './season-stats';

const box: ChartBox = { width: 100, height: 50, left: 0, right: 0, top: 0, bottom: 0 };

const emptySeries: ProceedsSeries = { points: [], undated: 0, total: 0, breakEven: null };

function seriesOf(cumulatives: number[], breakEvenIndex?: number): ProceedsSeries {
    const points: ProceedsPoint[] = cumulatives.map((cumulative, index) => ({
        at: new Date(Date.UTC(2026, 8, 1 + index)),
        saleId: `s${index}` as ProceedsPoint['saleId'],
        proceeds: cumulative - (cumulatives[index - 1] ?? 0),
        cumulative,
    }));

    return {
        points,
        undated: 0,
        total: cumulatives.at(-1) ?? 0,
        breakEven: breakEvenIndex === undefined ? null : points[breakEvenIndex],
    };
}

describe('buildGeometry', () => {
    describe('when there are no points', () => {
        it('returns null', () => {
            expect(buildGeometry(emptySeries, 100, box)).toBeNull();
        });
    });

    describe('when there are two points above and below the pass line', () => {
        it('starts the step path at zero on the first date and runs to the plot edge', () => {
            const geometry = buildGeometry(seriesOf([10, 30]), 20, box);

            expect(geometry?.linePath).toBe('M0 50V40H100V20H100');
        });

        it('places the pass line at its value on the same scale', () => {
            expect(buildGeometry(seriesOf([10, 30]), 20, box)?.passY).toBe(30);
        });

        it('rounds the y axis up to a nice maximum', () => {
            const ticks = buildGeometry(seriesOf([10, 30]), 20, box)?.yTicks;

            expect(ticks?.map((tick) => tick.value)).toEqual([0, 25, 50]);
        });

        it('puts x ticks at the first and last point', () => {
            const ticks = buildGeometry(seriesOf([10, 30]), 20, box)?.xTicks;

            expect(ticks?.map((tick) => tick.x)).toEqual([0, 100]);
        });
    });

    describe('when all points share one date', () => {
        it('returns a single x tick', () => {
            const sameDay = seriesOf([10, 30]);
            sameDay.points[1] = { ...sameDay.points[1], at: sameDay.points[0].at };

            expect(buildGeometry(sameDay, 0, box)?.xTicks).toHaveLength(1);
        });
    });

    describe('when there is a single point', () => {
        it('returns a single x tick', () => {
            expect(buildGeometry(seriesOf([10]), 0, box)?.xTicks).toHaveLength(1);
        });
    });

    describe('when the pass price exceeds total proceeds', () => {
        it('includes the pass price in the y domain', () => {
            const geometry = buildGeometry(seriesOf([10]), 100, box);

            expect(geometry?.yTicks.at(-1)?.value).toBe(100);
            expect(geometry?.passY).toBe(0);
        });
    });

    describe('when there is no pass', () => {
        it('has no pass line', () => {
            expect(buildGeometry(seriesOf([10, 30]), 0, box)?.passY).toBeNull();
        });
    });

    describe('when there is a single point', () => {
        it('centres it by padding the x domain', () => {
            const geometry = buildGeometry(seriesOf([10]), 0, box);

            expect(geometry?.linePath).toBe('M50 50V0H100');
        });
    });

    describe('when the series has a break-even point', () => {
        it('returns its position on the scales', () => {
            const geometry = buildGeometry(seriesOf([10, 30], 1), 20, box);

            expect(geometry?.breakEven).toEqual({ x: 100, y: 20 });
        });
    });

    describe('when the series has no break-even point', () => {
        it('returns null', () => {
            expect(buildGeometry(seriesOf([10, 30]), 0, box)?.breakEven).toBeNull();
        });
    });

    describe('when the box has margins', () => {
        it('keeps the plot inside them', () => {
            const geometry = buildGeometry(seriesOf([10, 30]), 0, {
                width: 200,
                height: 100,
                left: 20,
                right: 10,
                top: 5,
                bottom: 15,
            });

            expect(geometry?.plot).toEqual({ x0: 20, x1: 190, y0: 5, y1: 85 });
        });
    });
});
