# PSG-88 Dashboard proceeds chart and per-ticket figures - design

Parent: PSG-76 (Stitch redesign). Builds on `docs/specs/2026-11-20-psg-80-dashboard-redesign-design.md`
(Dashboard layout, `BreakEvenBar`, `MathBlock`) and `docs/specs/2026-11-20-psg-83-accounting-page-design.md`
(realized figures vocabulary). Plan: `docs/plans/2026-11-25-psg-88-dashboard-proceeds-chart-per-ticket-figures-plan.md`.

Scope: `web/` only, route `(app)/dashboard`. No backend change, no new dependency.
Out of scope: CSV export.

## 1. Goal

Two Stitch features the redesign slices did not cover:

1. A chart of cumulative SOLD proceeds over time against the season pass cost, with the
   break-even point marked.
2. Three per-ticket figures: average ticket price, average profit per match, ROI %.

Both are derived from data the Dashboard already loads. No invented data: anything that cannot
be derived is omitted and said so.

## 2. Accounting API check (requested first step)

| Need | API today | Verdict |
|---|---|---|
| Average ticket price | `Accounting.averageTicketPrice` (`AvgTicketPrice`) | Exists but is Prisma `_avg(listedPrice)`, an average per **sale row**, not per ticket. Wrong when a row has more than one ticket. Already shown as "Avg price" in `AccountingCard` (Details disclosure on `/accounting`). |
| Average profit | `Accounting.averageProfit` (`AvgProfit`) | Exists but is `_avg(profit)` per **sale row**, gross proceeds (before ticket invest). Not per match. |
| ROI | none | Missing. |
| Cumulative proceeds over time | none by sold date. `Amortization.perMatch` is cumulative realized proceeds ordered by **match date** | Not available by sold date. |
| Sold date | `SaleListItem.soldAt` (`string | null`) returned by `GET /sales/season/:year` (db uses `include`, so all scalar columns) | Available. Null for sales whose sold date is unknown (see section 4, D3). |
| Pass cost | `Amortization.passPrice` / `hasPass`, `TimePeriodAccounting.totalSeasonInvestment` | Available. |

Related defect found, not part of this ticket: `Accounting.totalSales` is a misnomer for
`sum(listedPrice)` (`format-aggregate.util.ts`; `web/src/routes/+page.server.ts:117` already notes
it). The Dashboard pending/cancelled/gifted tiles and the Accounting page render it as a sales or
ticket count. This plan does not read `totalSales`. Filed as a separate ticket (section 7).

Conclusion: the existing averages cannot back the requested figures, and a backend aggregate
would duplicate the sales list the page already fetches. Compute on the web from
`SaleListItem[]` plus `Amortization`.

## 3. Design

### 3.1 Pure module `web/src/lib/season-stats.ts` (vitest)

Input: `SaleListItem[]` (one season), `passPrice: number`.

- `proceedsSeries(sales, passPrice)` returns
  `{ points, undated, total, breakEven }`.
  - Considers `status === 'SOLD'` only.
  - `points`: SOLD sales with a valid `soldAt`, sorted ascending by time, each
    `{ at: Date, saleId, proceeds: sale.profit, cumulative }`. Cumulative is gross realized
    proceeds (`profit`, after commission, before ticket invest): the same basis as
    `Amortization.progress` and `BreakEvenBar`, so the chart and the bar agree. Rounded to
    cents at each step to avoid float drift against the pass price.
  - `undated`: count of SOLD sales with null or unparseable `soldAt`, excluded from `points`.
  - `total`: cumulative of dated points.
  - `breakEven`: first point where `cumulative >= passPrice`, or `null` (no pass, `passPrice`
    not positive, or never reached).
- `perTicketFigures(sales, seasonInvest)` returns
  `{ avgTicketPrice, avgNetPerMatch, roi } ` each `number | null`.
  - Over SOLD sales only (all of them, including undated: these figures need no date).
  - `avgTicketPrice = sum(listedPrice) / sum(nbTickets)`; null when no tickets.
  - `avgNetPerMatch = sum(profit - invest) / distinctMatchCount`; null when no matches.
  - `roi = net / (sum(invest) + seasonInvest)` as a fraction where `net = sum(profit - invest)
    - seasonInvest`; null when the cost base is 0.

### 3.2 Geometry `web/src/lib/chart-geometry.ts` (vitest)

Pure functions from `proceedsSeries` output plus a viewBox size to SVG numbers: linear time
scale over `[firstSoldAt, lastSoldAt]` (padded when a single point), linear y scale over
`[0, max(total, passPrice)]` with a rounded ceiling, step path (`H` then `V`) for the cumulative
line, y position of the pass line, break-even marker position, and axis tick values (3 to 4
y ticks, first/last date x ticks). No DOM, no Svelte.

### 3.3 Components

- `web/src/lib/ui/ProceedsChart.svelte`: inline SVG, props `series`, `passPrice`, `hasPass`.
  Renders the step line (`positive`), the pass line (dashed, `warning`), the break-even marker
  (circle + text label "Break-even, {shortDate}") and axes in design tokens. `role="img"` with an
  `aria-label` summarising total vs pass cost and the break-even date, plus a `sr-only` list of
  the same figures. Color is never the only signal: the pass line carries a text label
  ("Season pass {money}") and the marker a text label.
  Empty states, each a single muted sentence in place of the SVG: no dated SOLD sales ("No
  sold sales with a sold date yet."); no pass (chart still renders the cumulative line, caption
  "No season pass recorded." with the same `/season` link as the Net card).
  When `undated > 0`, one muted line under the chart: "{n} sold sale(s) have no sold date and
  are not plotted."
- `web/src/lib/ui/PerTicketFigures.svelte`: three tiles in the existing tile style (label,
  figure, one-line basis text): "Average ticket price" ("per ticket, SOLD"), "Average net per
  match" ("per match with a SOLD sale, after ticket invest"), "ROI" ("net realized over ticket
  invest plus season pass"). Null figure renders an em dash with the basis text replaced by
  the reason (for example "No ticket invest or season pass recorded").

### 3.4 Dashboard wiring

No load change: `data.sales` and `data.amortization` are already streamed.

- Season pass recovery card: the existing `{#await data.amortization}` stays as is. Under the
  bar and caption, a nested `{#await Promise.all([data.amortization, data.sales])}` renders the
  chart with its own skeleton and its own `role="alert"` error (PSG-80 rule: each await owns
  its error). The bar never waits on the sales fetch. The amortization promise is shared, so
  there is no extra request.
- Per-ticket tiles: new section between the three status tiles and the recovery card, inside
  its own `{#await data.sales}` plus `data.accounting` for `totalSeasonInvestment`. Uses
  `Promise.all([data.accounting, data.sales])` nested await with a tile skeleton.

Layout order: header, Net card, status tiles, per-ticket tiles, recovery card (bar, chart),
recent sales, Ask.

## 4. Open design decisions (recommendation first; confirm before building where marked)

- **D1 Chart x-axis: sold date vs match date.** Recommended: sold date (`soldAt`), as the
  ticket states. Consequence: break-even date from the chart can differ from
  `Amortization.breakEven` (by match date) and from the Dashboard caption wording; the chart
  marker is labelled with its own sold date so it is not claiming the match date. Alternative:
  plot `Amortization.perMatch` by match date (zero new pure logic, no null dates, one source of
  truth for break-even), but it contradicts "derived from sold dates" and shows when tickets
  were used, not when cash arrived. Needs confirmation.
- **D2 Per-ticket basis: is `listedPrice` the total for the row or per ticket? Needs confirmation
  before building.** Evidence it is the row total: `computeProfit` / `computeSaleBreakdown`
  never multiply by `nbTickets`; `summarizeSales` sums `profit` straight into proceeds. The
  design assumes row total, so average ticket price = sum(listedPrice) / sum(nbTickets). If it
  were per ticket the formula would be sum(listedPrice * nbTickets) / sum(nbTickets).
- **D3 Sales with no `soldAt`.** Legacy rows had `sold_at` nulled by
  `20260724150000_fix_epoch_backfill_corruption`; imports can carry null. Recommended: exclude
  from the chart, say so in one line, never fall back to match date or created date (that is
  invented data). Chart end value can therefore be below realized proceeds; the line under the
  chart is the explanation.
- **D4 Gifted and other statuses.** SOLD only for the chart and all three figures (same
  "realized" definition as PSG-86). GIFTED, PENDING, CANCELLED are excluded from numerators
  and from the ticket and match denominators. A gifted ticket has no price, so including it
  would drag the average down with a number nobody paid. Its cost is already inside the pass
  cost term of ROI.
- **D5 ROI definition.** Recommended: `net realized / (ticket invest + season pass)` where
  net = proceeds - ticket invest - season pass (the Net card figure). So ROI is the return on
  everything the user put in this season, and the Net card and ROI always agree in sign.
  Alternatives: ROI on the pass only (proceeds / pass - 1; ignores invest), or ROI on ticket
  invest only (undefined for most users, who have zero invest). Undefined (cost base 0)
  renders an em dash with reason, never 0%. Shown with one decimal, sign always, via a new
  `percent` formatter in `format.ts` (`fr-FR`, `signDisplay: 'exceptZero'`, like `signedMoney`).
- **D6 "Average profit per match" meaning.** Recommended: net after ticket invest, before the
  season pass (a lump sum that is not per match), averaged over matches with at least one SOLD
  sale. Alternative: divide by all matches in the pass (shows dilution by unsold matches).
  Labelled "Average net per match" so the figure is not mistaken for gross.
- **D7 Chart library: hand-rolled SVG.** Recommended. One step line, one horizontal line, one
  marker, two axes: about 120 lines of Svelte plus a pure, tested geometry module. A library
  (LayerChart, uPlot, Chart.js, d3) adds a pinned dependency and bundle weight on a Cloudflare
  Worker build, plus theming work to match tokens and `prefers-reduced-motion`, for one chart.
  Reconsider if a second chart is requested.
- **D8 Placement of the chart.** Inside the existing "Season pass recovery" card, under the
  bar. Alternative: new card. Chosen because the bar and chart answer the same question.
- **D9 Scope: season view only.** The Dashboard is season-scoped (`resolveSeasonYear`); no
  all-seasons variant of the chart.

## 5. Error handling and edge cases

- No SOLD sales: chart empty state, tiles show dashes.
- Single dated point: x domain padded so the point and pass line are visible.
- Several sales with the same `soldAt`: processed in input order after a stable sort, one
  point each.
- Pass price 0 or no pass: no pass line, no marker.
- Net negative: ROI negative, tone `negative-strong` with sign, same rule as `netTone`.
- `listedPrice`/`profit` are validated numbers from the API; no new branded types needed in
  `web/` (display aggregates stay `number`, as `sale-math.ts` does today).

## 6. Testing

Vitest (`web/`, node env): `season-stats.spec.ts` (series order, cents rounding, break-even
first crossing, undated exclusion, non-SOLD exclusion, empty, no pass; figures per formula,
null on zero denominators, multi-ticket rows, two sales on one match), `chart-geometry.spec.ts`
(scales, single point, step path, marker position, pass line above/below total), new
`format.spec.ts` for `percent` (no spec exists for `format.ts` today). Playwright: extend `e2e/tests/dashboard.e2e-spec.ts` (already in
`testMatch`) with heading and tile-label assertions. Gate: `npm run check && npm run typecheck
&& npm test && npm run lint && npm run build && test -f .svelte-kit/cloudflare/_worker.js` in
`web/`.

## 7. Follow-ups (separate tickets, not footnotes)

- Fix `totalSales` misnomer: backend field rename or true sale count, plus Dashboard pending /
  cancelled / gifted counts and Accounting page text that treat it as a count. Two layers, so
  two tickets. Also add to `docs/tech-debt.md` per the repo convention.
- Optionally retire the per-row `averageTicketPrice` / `averageProfit` or relabel them in
  `AccountingCard` ("per sale") once D2 is settled.
