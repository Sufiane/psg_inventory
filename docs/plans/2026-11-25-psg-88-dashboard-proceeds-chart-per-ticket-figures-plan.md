# PSG-88 Dashboard proceeds chart and per-ticket figures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Builder: `frontend-builder` only (frontend-only ticket, no backend task exists).

**Goal:** Add a cumulative SOLD proceeds vs season pass chart (break-even marked) and three per-ticket figures (average ticket price, average net per match, ROI %) to the Dashboard.

**Architecture:** Pure, tested view logic (`season-stats.ts`, `chart-geometry.ts`) derives everything from the `SaleListItem[]` and `Amortization` the Dashboard already streams; two thin Svelte components render it (hand-rolled SVG, no chart library); the Dashboard page adds two nested awaits. No load change, no backend change.

**Tech Stack:** SvelteKit 2.61.1, Svelte 5.59.1 runes, Tailwind 4.3.5, Vitest 5.1.1 (node env), Playwright (`e2e/`). No new dependencies.

**Spec:** `docs/specs/2026-11-25-psg-88-dashboard-proceeds-chart-per-ticket-figures-design.md` (read sections 2, 3 and 4). Parent: PSG-76. Related: `docs/specs/2026-11-20-psg-80-dashboard-redesign-design.md`, `docs/plans/2026-11-20-psg-83-accounting-page-plan.md`.

## Global Constraints

- Pinned deps only; this ticket adds none. If a task seems to need one, stop and escalate.
- No barrels; import from the specific file. Explicit return types on every function. No single-letter names except `i/j/k` in indexed `for` loops. No inline `if`: always braces, body on its own line. Blank line before `if/for/while/return/throw` unless first in block. No `!!`; use `Boolean(x)` or `x != null`. Numeric separators on literals of 5+ digits. No nested function declarations. No comments unless a non-obvious why.
- Copy: sentence case, no marketing words, no exclamation marks. Colour is never the only signal (labels and signs always present). Negative values use `negative` tokens with the sign shown.
- Tests: Vitest, a nested `describe` per condition ("when ..."), `it` titles state only the outcome, shared setup in that `describe`'s `beforeEach`. Run in `web/` with `npx vitest run <file>`.
- Realized means `status === 'SOLD'` only. Gifted, pending, cancelled never enter a numerator or denominator (spec D4).
- Conventional commits, scope `web`, lowercase imperative, no PR numbers, end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage and stop for `/crit`; do not commit until the user says so. Branch is `psg-88` already (correct name; verify with `git branch --show-current` before the first push). Linear: PSG-88 to In Progress before starting, In Review only when staged.

## Size and ticket split

Estimate (added plus removed, tests and docs included): about **700**, under the 800 cap. One PR, one actor (authenticated), one layer (web).

| Task group | Lines |
|---|---|
| T1 `season-stats.ts` + spec | ~230 |
| T2 `chart-geometry.ts` + spec, `percent` + spec | ~210 |
| T3 `ProceedsChart.svelte`, `PerTicketFigures.svelte` | ~170 |
| T4 Dashboard wiring, e2e, tech-debt entry | ~90 |

No backend work, so no ordering with a backend slice. Natural seam if the builder lands above 800 or the coordinator prefers two PRs: **PSG-88a** per-ticket figures (T1 `perTicketFigures` half + `percent` + `PerTicketFigures` + its wiring, ~330) and **PSG-88b** chart (T1 `proceedsSeries` half + T2 geometry + `ProceedsChart` + its wiring, ~380). They share no code except the Dashboard page edit, so they merge in either order. Do not pre-split.

Follow-ups, each its own ticket (not in this plan): (1) `totalSales` misnomer fix, two layers so two tickets, see spec section 7; (2) relabel or retire the per-row `averageTicketPrice` / `averageProfit` in `AccountingCard`. Task 4 adds the tech-debt entry for (1).

## Open decisions to confirm before Task 1 (spec section 4)

The tasks below implement the **recommended** choice for each. If the coordinator or user overrides one, only the named task changes.

| ID | Decision | Recommended | Changes if overridden |
|---|---|---|---|
| D1 | Chart x-axis | sold date (`soldAt`) | T1, T2, T3 swap to `Amortization.perMatch` by match date; `season-stats` loses `proceedsSeries` (about -120 lines) |
| D2 | `listedPrice` is row total | yes | T1 `avgTicketPrice` formula becomes `sum(listedPrice * nbTickets) / sum(nbTickets)` |
| D3 | Sales with null `soldAt` | excluded, counted in `undated`, one note line | T1 + T3 |
| D5 | ROI | `net / (ticket invest + season pass)` | T1 `roi` line + T3 basis copy |
| D6 | Average per match | net after invest, before pass, over matches with a SOLD sale | T1 `avgNetPerMatch` + T3 copy |
| D7 | Chart library | hand-rolled SVG | T2/T3 replaced by a pinned dependency |

D1 and D2 are the two that block starting.

## File map

- Create `web/src/lib/season-stats.ts`, `web/src/lib/season-stats.spec.ts`
- Create `web/src/lib/chart-geometry.ts`, `web/src/lib/chart-geometry.spec.ts`
- Modify `web/src/lib/format.ts` (add `percent`); create `web/src/lib/format.spec.ts`
- Create `web/src/lib/ui/ProceedsChart.svelte`, `web/src/lib/ui/PerTicketFigures.svelte`
- Modify `web/src/routes/(app)/dashboard/+page.svelte`
- Modify `e2e/tests/dashboard.e2e-spec.ts` (already in Playwright `testMatch`; no config change)
- Modify `docs/tech-debt.md`

Untouched on purpose: `dashboard/+page.server.ts` (`data.sales`, `data.amortization`, `data.accounting` already streamed), `sale-math.ts`, `dashboard.ts`, `BreakEvenBar`, all backend code.

---

## Task 1: pure stats helpers (TDD)

**Files:**
- Create: `web/src/lib/season-stats.spec.ts`
- Create: `web/src/lib/season-stats.ts`

**Interfaces:**
- Consumes: `SaleListItem` from `$lib/types` (fields used: `id`, `matchId`, `status`, `listedPrice`, `profit`, `invest`, `nbTickets`, `soldAt?: string | null`).
- Produces (exact; Tasks 2 to 4 depend on these):
```ts
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

export function proceedsSeries(sales: SaleListItem[], passPrice: number): ProceedsSeries;
export function perTicketFigures(sales: SaleListItem[], seasonInvest: number): PerTicketFigures;
```

- [ ] **Step 1: Write the failing spec** `web/src/lib/season-stats.spec.ts`

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run (in `web/`): `npx vitest run src/lib/season-stats.spec.ts`
Expected: FAIL, cannot resolve `./season-stats`.

- [ ] **Step 3: Implement** `web/src/lib/season-stats.ts`

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/season-stats.spec.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Stage** `git add web/src/lib/season-stats.ts web/src/lib/season-stats.spec.ts` (do not commit; message for later: `feat(web): derive proceeds series and per-ticket figures`).

---

## Task 2: chart geometry and percent formatter (TDD)

**Files:**
- Create: `web/src/lib/chart-geometry.spec.ts`, `web/src/lib/chart-geometry.ts`
- Create: `web/src/lib/format.spec.ts`
- Modify: `web/src/lib/format.ts` (append `percent` after `signedMoney`)

**Interfaces:**
- Consumes: `ProceedsSeries` from `./season-stats` (Task 1).
- Produces:
```ts
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

export function buildGeometry(
    series: ProceedsSeries,
    passPrice: number,
    box: ChartBox,
): ChartGeometry | null;
```
and in `format.ts`: `export function percent(fraction: number): string`.

Geometry rules (the spec file below pins them): plot is `[left, width-right] x [top, height-bottom]`, y increases downward so `y1` (bottom) is value 0. `yMax = niceCeil(max(total, passPrice))` where `niceCeil(v)` rounds up to 1, 2, 5 or 10 times a power of ten (30 becomes 50, 100 stays 100). X domain is first to last point time; a single point pads the domain by one day each side. Line is a step path `M{x0} {y0}` then per later point `H{x} V{y}`, then a final `H{plotRight}`. Numbers are rounded to 2 decimals. Y ticks at `0`, `yMax / 2`, `yMax`. X ticks at the domain start and end. Returns `null` when there are no points.

- [ ] **Step 1: Write the failing specs.** In `chart-geometry.spec.ts`, use a zero-margin box `{ width: 100, height: 50, left: 0, right: 0, top: 0, bottom: 0 }`, a helper `series(...cumulatives)` that builds a `ProceedsSeries` with points one day apart from `2026-09-01` and `breakEven` set by the helper argument, and these cases (each in its own `describe`):

```ts
describe('buildGeometry', () => {
    describe('when there are no points', () => {
        it('returns null', () => {
            expect(buildGeometry(emptySeries, 100, box)).toBeNull();
        });
    });

    describe('when there are two points above and below the pass line', () => {
        it('draws a step path from the first point to the plot edge', () => {
            const geometry = buildGeometry(seriesOf([10, 30]), 20, box);

            expect(geometry?.linePath).toBe('M0 40H100V20H100');
        });

        it('places the pass line at its value on the same scale', () => {
            expect(buildGeometry(seriesOf([10, 30]), 20, box)?.passY).toBe(30);
        });

        it('rounds the y axis up to a nice maximum', () => {
            const ticks = buildGeometry(seriesOf([10, 30]), 20, box)?.yTicks;

            expect(ticks?.map((tick) => tick.value)).toEqual([0, 25, 50]);
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

            expect(geometry?.linePath).toBe('M50 0H100');
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
});
```
`seriesOf(cumulatives, breakEvenIndex?)` builds points `{ at: new Date(Date.UTC(2026, 8, 1 + index)), saleId: \`s${index}\`, proceeds, cumulative }`, `total` = last cumulative, `undated` 0. For the single-point case the one-day pad puts the point at x 50.

`format.spec.ts`:
```ts
describe('percent', () => {
    describe('when the fraction is positive', () => {
        it('shows one decimal with an explicit plus sign', () => {
            expect(percent(0.125).replace(/\s/g, ' ')).toBe('+12,5 %');
        });
    });

    describe('when the fraction is negative', () => {
        it('shows a minus sign and one decimal', () => {
            const text = percent(-0.5).replace(/\s/g, ' ');

            expect(text).toMatch(/^[-−]50,0 %$/);
        });
    });

    describe('when the fraction is 0', () => {
        it('shows no sign', () => {
            expect(percent(0).replace(/\s/g, ' ')).toBe('0,0 %');
        });
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/chart-geometry.spec.ts src/lib/format.spec.ts`
Expected: FAIL (missing module, missing export).

- [ ] **Step 3: Implement.** Add to `format.ts`:
```ts
const PERCENT = new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
});

export function percent(fraction: number): string {
    return PERCENT.format(fraction);
}
```
Write `chart-geometry.ts` with: `niceCeil(value: number): number` (internal, `Math.pow(10, Math.floor(Math.log10(value)))`, normalized step 1/2/5/10; return 1 when `value <= 0`), `round(value: number): number` (`Math.round(value * 100) / 100`), a scale helper `scale(value, domainMin, domainMax, rangeStart, rangeEnd): number` (returns `rangeStart` when the domain is empty), and `buildGeometry` per the rules above. Module-level functions only (no nested declarations); line path built with a `for` loop over `series.points`.

- [ ] **Step 4: Run to verify they pass.** Same command. Expected: PASS. If `percent` output differs in separator characters across ICU versions, adjust only the spec's whitespace normalisation, not the formatter.

- [ ] **Step 5: Stage** the five files (message for later: `feat(web): add chart geometry and percent formatter`).

---

## Task 3: components

**Files:**
- Create: `web/src/lib/ui/ProceedsChart.svelte`
- Create: `web/src/lib/ui/PerTicketFigures.svelte`

No unit tests (logic lives in Tasks 1 and 2); covered by the Task 4 e2e and `npm run check`.

**Interfaces:**
- Consumes: `ProceedsSeries`, `PerTicketFigures` (Task 1; import the type as `type PerTicketFigures as Figures` in the component to avoid the name clash), `buildGeometry`, `ChartBox` (Task 2), `money`, `signedMoney`, `percent`, `shortDate` from `$lib/format`, `carrySeason` from `$lib/season`, `page` from `$app/state`.
- Produces: `<ProceedsChart series={ProceedsSeries} passPrice={number} hasPass={boolean} />`, `<PerTicketFigures figures={Figures} />`.

- [ ] **Step 1: `ProceedsChart.svelte`.** Props above. `const box: ChartBox = { width: 640, height: 240, left: 56, right: 16, top: 12, bottom: 28 }`; `const geometry = $derived(buildGeometry(series, passPrice, box))`. Markup, in order:
  - If `geometry === null`: `<p class="text-sm text-ink-muted">No sold sales with a sold date yet.</p>` and nothing else except the undated line below.
  - Else `<svg viewBox="0 0 640 240" role="img" aria-label={summary} class="w-full h-auto">` where `summary` is a `$derived` sentence: `Cumulative sold proceeds {money(series.total)}` plus, when `hasPass`, ` against season pass {money(passPrice)}` and, when `series.breakEven`, `, break-even on {shortDate(series.breakEven.at)}`.
  - Y ticks: a `<line class="stroke-line">` across the plot and a `<text class="fill-ink-faint font-mono text-[10px]" text-anchor="end">` with `money(tick.value)` at `x = plot.x0 - 8`.
  - X ticks: `<text text-anchor="start">` / `"end"` for the first and last, label `shortDate(tick.at)`.
  - Cumulative line: `<path d={geometry.linePath} fill="none" class="stroke-positive" stroke-width="2" />`.
  - When `geometry.passY !== null`: `<line class="stroke-warning" stroke-dasharray="6 4">` across the plot plus `<text class="fill-warning-strong">Season pass {money(passPrice)}</text>` placed above the line at the right edge.
  - When `geometry.breakEven`: `<circle r="5" class="fill-positive stroke-surface" stroke-width="2">` and `<text class="fill-ink">Break-even, {shortDate(series.breakEven.at)}</text>`, anchored `end` and nudged left when `x` is within 120 units of the right edge (compute this in a `$derived`, not inline in the template).
  - Under the SVG: when `series.undated > 0`, `<p class="mt-2 text-xs text-ink-muted">{series.undated} sold {series.undated === 1 ? 'sale has' : 'sales have'} no sold date and {series.undated === 1 ? 'is' : 'are'} not plotted.</p>`; when `!hasPass`, `<p class="mt-2 text-xs text-ink-muted">No season pass recorded. <a href={carrySeason('/season', page.url)} class="text-primary font-medium hover:text-primary-hover hover:underline">Set it on the Season tab.</a></p>` (same wording and link classes as the Net card).
  - Respect `prefers-reduced-motion`: no animation on the SVG at all (nothing to disable).

- [ ] **Step 2: `PerTicketFigures.svelte`.** Props `{ figures }`. A `<div class="grid gap-4 sm:grid-cols-3 mb-6">` with three `<section class="bg-surface rounded-lg border border-line p-4" aria-labelledby=...>` tiles matching the Dashboard status tiles (heading `text-sm font-medium text-ink-muted`, figure `mt-1 font-mono text-xl font-semibold`, basis `text-xs text-ink-muted`):
  - "Average ticket price": `money(figures.avgTicketPrice)`, basis "per ticket, SOLD sales". Null: `—`, basis "No SOLD tickets yet".
  - "Average net per match": `signedMoney(figures.avgNetPerMatch)` toned by sign (`text-positive-strong` / `text-negative-strong` / `text-ink`), basis "per match with a SOLD sale, after ticket invest". Null: `—`, basis "No SOLD sales yet".
  - "ROI": `percent(figures.roi)` toned by sign, basis "net over ticket invest plus season pass". Null: `—`, basis "No ticket invest or season pass recorded".
  Add `data-numeric` on figures as the other tiles do. Extract the tone choice into a module-level `toneOf(value: number | null): string` in the component's `<script>` (not nested).

- [ ] **Step 3: Check.** In `web/`: `npm run check`. Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Stage** both files (message for later: `feat(web): add proceeds chart and per-ticket tiles`).

---

## Task 4: Dashboard wiring, e2e, tech-debt entry, gate

**Files:**
- Modify: `web/src/routes/(app)/dashboard/+page.svelte`
- Modify: `e2e/tests/dashboard.e2e-spec.ts`
- Modify: `docs/tech-debt.md`

**Interfaces:** Consumes everything above plus existing `data.accounting`, `data.amortization`, `data.sales`.

- [ ] **Step 1: Per-ticket tiles.** In `+page.svelte`, add imports for `PerTicketFigures`, `ProceedsChart`, `perTicketFigures`, `proceedsSeries`. After the status-tiles block (the `{:catch err}` of the first `{#await data.accounting}` stays as is), add a section with a nested await:
```svelte
{#await Promise.all([data.accounting, data.sales])}
    <div class="grid gap-4 sm:grid-cols-3 mb-6">
        {#each Array(3) as _, i (i)}
            <div class="bg-surface rounded-lg border border-line p-4 space-y-2">
                <Skeleton width="40%" height="0.85rem" />
                <Skeleton width="60%" height="1.5rem" />
                <Skeleton width="50%" height="0.75rem" />
            </div>
        {/each}
    </div>
{:then [accounting, sales]}
    <div in:fade={{ duration: 120, easing: cubicOut }}>
        <PerTicketFigures
            figures={perTicketFigures(sales, accounting.totalSeasonInvestment)}
        />
    </div>
{:catch err}
    <div class="mb-6">{@render failure('per-ticket figures', err)}</div>
{/await}
```
  Note this awaits the same two promises other blocks await; rejection surfaces in each block (existing pattern). Season pass cost uses `accounting.totalSeasonInvestment` (same source as `realizedFigures`), so ROI's net equals the Net card.

- [ ] **Step 2: Chart.** Inside the "Season pass recovery" section, after the existing `{#await data.amortization}...{/await}` block, add:
```svelte
{#await Promise.all([data.amortization, data.sales])}
    <div class="mt-4"><Skeleton height="15rem" width="100%" rounded="rounded-lg" /></div>
{:then [amortization, sales]}
    <div in:fade={{ duration: 120, easing: cubicOut }} class="mt-4">
        <ProceedsChart
            series={proceedsSeries(sales, amortization.passPrice)}
            passPrice={amortization.passPrice}
            hasPass={amortization.hasPass}
        />
    </div>
{:catch err}
    <div class="mt-4">{@render failure('proceeds chart', err)}</div>
{/await}
```
  The bar block above is untouched, so it never waits on sales. When the amortization endpoint failed, the bar shows its own alert and the chart shows a second one; acceptable and consistent with the per-await error rule.

- [ ] **Step 3: e2e.** In `e2e/tests/dashboard.e2e-spec.ts` extend the existing test (or add a second `test` in the same `describe`):
```ts
await expect(page.getByRole('heading', { name: 'Average ticket price' })).toBeVisible();
await expect(page.getByRole('heading', { name: 'Average net per match' })).toBeVisible();
await expect(page.getByRole('heading', { name: 'ROI' })).toBeVisible();
await expect(
    page.getByRole('img', { name: /Cumulative sold proceeds/ }).or(
        page.getByText('No sold sales with a sold date yet.'),
    ),
).toBeVisible();
```
  (Seed data may or may not have dated SOLD sales; the `or` keeps the test deterministic without inventing seed rows.)

- [ ] **Step 4: tech-debt entry.** Append to `docs/tech-debt.md`, in the file's existing format:
```markdown
## `totalSales` is a listed-price sum, rendered as a count (PSG-88)

`Accounting.totalSales` is `sum(listedPrice)` (`format-aggregate.util.ts`), but the Dashboard
pending / cancelled / gifted tiles and the Accounting page pending line render it as a sale or
ticket count. Found while checking the accounting API for PSG-88; PSG-88 does not read it.
Deferred because the fix spans the API field and every consumer. Acting costs a backend rename
or a real count field plus web consumer changes: two tickets.
```
  The coordinator files the matching `PSG-*` Linear issue (assignee "me", label per the repo's tech-debt convention) before telling the user the work is ready for `/crit`.

- [ ] **Step 5: Gate.** In `web/`: `npm run check && npm run typecheck && npm test && npm run lint && npm run build && test -f .svelte-kit/cloudflare/_worker.js`. Expected: all pass, file exists. Build exit 0 alone is not evidence; the `test -f` is required. Then run the Dashboard e2e per `e2e/` README (`npx playwright test dashboard`) if the harness is available locally; otherwise leave to `qa-verifier`.

- [ ] **Step 6: Stage everything and stop.** `git add -A` for the files above, tell the user it is staged and they can run `/crit`. Do not commit until they approve.

---

## Self-review

- Spec coverage: section 2 API check (documented, no task needed); 3.1 `season-stats` (T1); 3.2 geometry (T2); 3.3 both components (T3); 3.4 wiring (T4); D1 to D9 reflected (D8 placement and D9 season-only are structural, D4 in T1 filters); section 5 edge cases are T1/T2 spec cases (single point, no pass, no sales, undated, negative net); section 6 testing (T1, T2, T4); section 7 follow-ups (tech-debt entry in T4, tickets named above).
- Placeholders: none; T2 and T3 describe markup and geometry rules exactly instead of full code because the spec cases pin behaviour. If the builder finds a rule ambiguous, the T2 spec file wins.
- Type consistency: `ProceedsSeries`, `ProceedsPoint`, `PerTicketFigures` (Task 1) match their use in T2 to T4; component prop name `figures` and `series` consistent; `percent(fraction)` takes a fraction everywhere (`roi` is a fraction).
