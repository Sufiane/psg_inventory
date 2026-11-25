import type { ProceedsSeries } from './season-stats';

export type ChartBox = {
    width: number;
    height: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
};

export type ChartGeometry = {
    plot: { x0: number; x1: number; y0: number; y1: number };
    linePath: string;
    passY: number | null;
    breakEven: { x: number; y: number } | null;
    yTicks: { value: number; y: number }[];
    xTicks: { at: Date; x: number }[];
};

const MS_PER_DAY = 86_400_000;

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

function niceCeil(value: number): number {
    if (value <= 0) {
        return 1;
    }

    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;

    if (normalized <= 1) {
        return magnitude;
    }

    if (normalized <= 2) {
        return 2 * magnitude;
    }

    if (normalized <= 5) {
        return 5 * magnitude;
    }

    return 10 * magnitude;
}

function scale(
    value: number,
    domainMin: number,
    domainMax: number,
    rangeStart: number,
    rangeEnd: number,
): number {
    if (domainMax === domainMin) {
        return rangeStart;
    }

    const ratio = (value - domainMin) / (domainMax - domainMin);

    return round(rangeStart + ratio * (rangeEnd - rangeStart));
}

export function buildGeometry(
    series: ProceedsSeries,
    passPrice: number,
    box: ChartBox,
): ChartGeometry | null {
    if (series.points.length === 0) {
        return null;
    }

    const plot = {
        x0: box.left,
        x1: box.width - box.right,
        y0: box.top,
        y1: box.height - box.bottom,
    };

    const firstTime = series.points[0].at.getTime();
    const lastTime = series.points[series.points.length - 1].at.getTime();
    const single = firstTime === lastTime;
    const timeMin = single ? firstTime - MS_PER_DAY : firstTime;
    const timeMax = single ? lastTime + MS_PER_DAY : lastTime;
    const yMax = niceCeil(Math.max(series.total, passPrice));

    const toX = (time: number): number => scale(time, timeMin, timeMax, plot.x0, plot.x1);
    const toY = (value: number): number => scale(value, 0, yMax, plot.y1, plot.y0);

    let linePath = '';

    for (let i = 0; i < series.points.length; i++) {
        const point = series.points[i];
        const x = toX(point.at.getTime());
        const y = toY(point.cumulative);

        linePath += i === 0 ? `M${x} ${toY(0)}V${y}` : `H${x}V${y}`;
    }

    linePath += `H${plot.x1}`;

    return {
        plot,
        linePath,
        passY: passPrice > 0 ? toY(passPrice) : null,
        breakEven:
            series.breakEven === null
                ? null
                : {
                      x: toX(series.breakEven.at.getTime()),
                      y: toY(series.breakEven.cumulative),
                  },
        yTicks: [0, yMax / 2, yMax].map((value) => ({ value, y: toY(value) })),
        xTicks: single
            ? [{ at: series.points[0].at, x: toX(firstTime) }]
            : [
                  { at: series.points[0].at, x: toX(firstTime) },
                  { at: series.points[series.points.length - 1].at, x: toX(lastTime) },
              ],
    };
}
