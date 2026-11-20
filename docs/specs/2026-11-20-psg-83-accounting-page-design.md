# PSG-83 accounting page (matchday strip, waterfall): design

Status: draft for review. Slice S6 of `docs/specs/2026-11-19-stitch-redesign-design.md`
(open questions Q3, Q4, Q11, Q12, Q13 already defaulted there; D-API-1 decided; not
relitigated here). Plan: `docs/plans/2026-11-20-psg-83-accounting-page-plan.md`.

Scope: `web/` only, branch `psg-83` (currently `kinshasa/psg-83-handle`, rename before first
push). **No backend change**: PSG-77 (`matchId` on `FormattedSale`) and PSG-79 (shell, season
selector, `resolveAccountingScope`) are on the branch; S1 primitives (`MathBlock`,
`StatusChip`, `BreakEvenBar`, `sale-math.ts`) exist. Every figure, segment and row the new
view needs is already served by existing endpoints (verified, section 3).

## 1. Goal

Rebuild `/accounting` to the brief's layout: four headline figures, an amortisation block,
a matchday strip (one segment per fixture with the break-even marker), a "How net profit is
calculated" waterfall, a per-sale match table with totals, and a bottom "Details"
disclosure holding the demoted lead-time strip and Realized card. Season view gets the full
layout; `year=all` gets figures + waterfall + Details (Q12; block, strip and table are
season-only). Legacy `?view=all-time` links keep resolving.

Out of scope: backend changes, the other slices (S3–S5, S7), any new dependency, component
test harness (F2).

## 2. "Waterfall" reconciliation (ticket title vs. spec)

The stitch brief file (`.context/stitch/design-brief.md`) is not in the repo; the only
waterfall references are two lines in the parent spec, both about accounting's all-time
view: "Keep 'All seasons' showing the four figures and the waterfall" (section 6) and
Q12 "'All seasons' accounting view reduced to figures plus waterfall". There is no waterfall
chart, component or data shape anywhere in the repo, and no endpoint serves chart series.

**Decision D1:** "waterfall" = the step-by-step money chain the brief's accounting section
describes, rendered as (a) the four headline figures — Realized proceeds → Pending → Season
pass cost → Net realized profit — and (b) the `MathBlock` under the heading "How net profit
is calculated": Realized proceeds (SOLD) `+`, Ticket invest `−`, Season pass `−`,
`= Net realized profit`. That block *is* the waterfall (each line steps down to the net),
it exists in both views (season and `year=all`, computed from `/accounting/all-time`), and
it is exactly what the current net card's `dl` already shows today, so no capability is
invented or lost. No charting library, no SVG chart: rejected — no brief mock exists in the
repo to implement, the parent spec never tasks a chart, and a chart would break the "no new
dependencies" constraint for zero verified requirement. If the user actually wants a visual
chart, that is a new ticket, not a correction to this one.

## 3. Data: API already complete (verified against code)

| View element | Source | Status |
|---|---|---|
| Four figures: realized, pending, pass cost, net | `GET /accounting/current-season` \| `/accounting/season/:y` \| `/accounting/all-time` → `TimePeriodAccounting` (`realized.totalProfit`, `pending.totalProfit`, `totalSeasonInvestment`; net = proceeds − invest − pass, computed in page) | existing |
| Amortisation: pass price, hasPass, progress, remaining, surplus, breakEven | `GET /accounting/amortization/:y` → `Amortization` | existing |
| Fixture list (opponent, date, competition) | `GET /matches/current-season` \| `/matches/season/:y` → `FormattedMatch[]` | existing |
| Per-match sale status, per-sale rows, gifted recipient | `GET /sales/current-season` \| `/sales/season/:y` → `SaleListItem[]` with `matchId` (PSG-77) and `Gift` | existing |
| Break-even segment | `Amortization.breakEven.matchId` | existing |
| Lead time, Realized card (best/worst/averages) | `TimePeriodAccounting.leadTime`, `.realized` | existing |

Fixtures come date-ordered from the backend; the strip and table preserve that order.
`Amortization.perMatch` (SOLD-only) is **not** used for the strip — the full match list +
season sales drive it (parent spec section 6, already decided).

## 4. Load contract

`web/src/routes/(app)/accounting/+page.server.ts` (rewrite; `accounting-scope.ts` and its
spec stay untouched). Load returns this shape (field names exact):

```ts
{
    accounting: Promise<TimePeriodAccounting>;
    seasonView: Promise<{
        amortization: Amortization | null;
        matches: FormattedMatch[];
        sales: SaleListItem[];
    }>;
    season: SeasonYear | 'all';
}
```

- Season resolution: `const scope = resolveAccountingScope(event.url)` (keeps legacy
  `?view=all-time`, PSG-79 D4); `season = scope.view === 'all-time' ? 'all' : (scope.year ?? seasonStartYearFromDate(new Date()))`.
- `season === 'all'`: `accounting = api('/accounting/all-time')`;
  `seasonView = Promise.resolve({ amortization: null, matches: [], sales: [] })`.
- `season = y`: `accounting = y === current ? '/accounting/current-season' : '/accounting/season/${y}'`;
  `amortization = api('/accounting/amortization/${y}')`;
  `matches = api(y === current ? '/matches/current-season' : '/matches/season/${y}')`
  (**no `withResult`** — accounting shows no scores, D7, correcting parent S6 step 3);
  `sales = api(y === current ? '/sales/current-season' : '/sales/season/${y}')`.
- All promises returned unawaited (streaming kept). `seasonView` bundles the three
  non-critical calls into one await site (D8). The old `view`/`year` fields are dropped
  (PSG-79 §7 explicitly allows PSG-83 to simplify); nothing else reads them.

Error handling: `accounting` failure keeps the existing `role="alert"` banner;
`seasonView` failure renders its own `role="alert"` line ("Failed to load matchday
details: …") — the strip is a headline feature, so silence would look like a bug; the four
figures and waterfall still render. Because the page interleaves both promises (§5), each
promise's **first** `{#await}` block owns the banner; later catch blocks on the same
promise render nothing, so one rejection shows exactly one banner.

## 5. Page layout (`+page.svelte` rewrite)

Season / current view, in order:

1. `h1` **"Season accounting"** (D2: `year=all` shows **"Accounting"** — "Season
   accounting" would be a lie there; the default-view e2e asserts the season title).
2. **Four figures** (one `section`, grid): *Net realized profit* largest (display font,
   `signedMoney`, `positive-strong`/`negative-strong`/`ink` by sign), then *Realized
   proceeds (SOLD)*, *Pending* (amount + ticket count), *Season pass cost*
   (`totalSeasonInvestment`). Sign + label always accompany colour.
3. **`AmortisationBlock`** (season view only).
4. **`MatchdayStrip`** (season view only).
5. **"How net profit is calculated"** — `MathBlock`:
   `Realized proceeds (SOLD) +`, `Ticket invest −`, `Season pass −`,
   result `Net realized profit`. Same three inputs as the Dashboard's S3 MathBlock, so the
   acceptance "figures equal Dashboard figures for the same season" holds by construction.
   No tax/audit/commission wording (Q13).
6. **`SeasonMatchTable`** + totals (season view only).
7. **"Details" disclosure** (`<details>`): `LeadTimeStrip` when `leadTime.soldCount >= 3`
   (unchanged threshold), then `AccountingCard` title "Realized"
   (`showSeason={isAll}` / `showDate={!isAll}`, exactly today's mapping).

`year=all` renders 1, 2, 5, 7 only (Q12). The order interleaves the two promises
(accounting feeds 1/2/5/7, `seasonView` feeds 3/4/6), so the page uses five `{#await}`
blocks over the same two promises — repeat awaits attach to the load's promise (created
once; no refetch; resolved promises render immediately). Skeletons in the pending state:
`NetProfitSkeleton` for the figures block, `Skeleton` placeholders (heights
`6`–`12rem`) for the others. In-page links (`/season`) wrap hrefs with `carrySeason`
(PSG-79 §7).

## 6. Components

### `MatchdayStrip.svelte` (new)

Props: `{ segments: StripSegment[] }` where `StripSegment` comes from `stripSegments`
(section 7). Markup: `<ol aria-label="Matchday strip">` with one `<li>` per segment:
visible `★` badge when `isBreakEven`, `shortDate` under each segment, and
`aria-label="{opponent}, {shortDate(date)}, {status or 'no sale'}{,
break-even}"` so colour is never alone. Legend **below** the list: five swatch + text
pairs (Sold, Pending, Gifted, Cancelled, No sale) plus a "★ break-even" note, marked
decorative (`aria-hidden`) since each segment already carries the text. Segment fills:
SOLD `bg-positive`, PENDING
`bg-warning`, CANCELLED `bg-[#6e5d6d]`, GIFTED `bg-gift`, null `bg-line-strong`
(parent S6 step 5 verbatim; `#6e5d6d` is a non-text fill, token per parent spec §3).
`title` on each segment repeats the aria-label for pointer users.

### `AmortisationBlock.svelte` (new)

Props: `{ data: Amortization; matchCount: number }`. Replaces `AmortizationCard`
(deleted, section 8):

- Heading "Season pass per match".
- No pass (`!data.hasPass || data.passPrice <= 0`): "No season pass set." +
  link "Add one on the Season page" → `carrySeason('/season', page.url)` with
  `page` imported from `$app/state` inside the component (same pattern as
  `SeasonSelect`), not a prop.
- With pass: equation line `{money(data.passPrice)} ÷ {matchCount} fixtures =
  {money(passCostPerMatch(data.passPrice, matchCount))}` with an `aria-label` spelling
  "divided by" / "equals" (screen readers don't usefully announce ÷ /=);
  Q3 divisor = all fixtures. `matchCount === 0` renders
  "No fixtures in this season." instead of the equation.
- `BreakEvenBar` (`progress`, `hasPass`) — parent spec §5 assigns the bar to Accounting.
- **Capability preserved from `AmortizationCard` (D3):** the "Remaining to clear" /
  "Surplus over pass" headline (`signedMoney`, tone per card logic) and the
  "Cleared at {opponent} on {date}" line. Deliberately **dropped**: the per-match
  cumulative `<details>` list — superseded by the strip (per-fixture status + break-even
  marker) and the match table (per-sale net), and the parent plan deletes
  `AmortizationCard`. Flagged for user overrule.

### `SeasonMatchTable.svelte` (new)

Props: `{ groups: SeasonTableRow[]; summary: SalesSummary }` (section 7). One `<tbody>`
per group (valid HTML, gives free group separation); every row repeats Match
(opponent + `shortDate(date)`), Competition (`competitionLabel`), Tickets, Listed price,
Invest, Net, Status — repeated so each row is self-contained (same accessible-name pattern
the Sales e2e relies on). Column semantics (D5):

- Net: SOLD → `signedMoney(saleNet(sale))`; PENDING and CANCELLED → `—`
  (unrealized net is not a result; cancelled shows no profit per brief);
- Listed price: GIFTED → `Gifted to {Gift.Recipient.name}` (price and net suppressed per
  brief); Net for GIFTED → `—`;
- Status: `StatusChip`.
- **Totals footer (D4, Q4 default extended):** `<tfoot>` renders one always-visible
  labelled summary line — Tickets, Proceeds (SOLD), Invest (SOLD), and **Net before
  season pass** (= `summary.netSold`), from `summarizeSales(allSales)` — deliberately a
  labelled line, not column-aligned cells, because "proceeds (SOLD)" ≠ the sum of the
  Listed-price column (proceeds are net of the 12 % commission the UI never names, Q13).
  Always rendered, including with zero rows, so the e2e totals assertion is stable.
- Zero sales: a single message row "No sales this season." above the totals.

## 7. Pure helpers — `web/src/lib/accounting-view.ts` (+ `.spec.ts`)

```ts
export function passCostPerMatch(passPrice: number, matchCount: number): number;
// matchCount === 0 -> 0, else passPrice / matchCount

export type StripSegment = {
    matchId: MatchId;
    opponent: string;
    date: string;
    status: SaleStatus | null;
    isBreakEven: boolean;
};

export function stripSegments(
    matches: FormattedMatch[],
    salesByMatch: Record<string, SaleListItem[]>,
    breakEvenMatchId: MatchId | null,
): StripSegment[];
// one segment per match, input (date) order kept, count === matches.length;
// status = dominantStatus(sales of that match) or null; isBreakEven = matchId equals
// breakEvenMatchId

export type SeasonTableRow = {
    matchId: MatchId;
    opponent: string;
    date: string;
    competition: string;
    sales: SaleListItem[];
};

export function tableGroups(
    matches: FormattedMatch[],
    salesByMatch: Record<string, SaleListItem[]>,
): SeasonTableRow[];
// matches with >= 1 sale, in matches order; sales in input order; groups whose matchId
// is absent from matches appended last (orphan sales never silently dropped from totals)
```

`tableGroups` is a small addition beyond the parent plan's two named helpers (D10): it
keeps grouping/ordering logic out of the component where it is vitest-coverable, per the
repo's helper-first convention. Totals come from `summarizeSales(sales)` (S1, unchanged)
over the raw sales list — same set the groups contain.

Consumes (all landed): `groupSalesByMatch`, `dominantStatus`, `saleNet`,
`summarizeSales` (`$lib/sale-math.ts`), `MathBlock`, `StatusChip`, `BreakEvenBar`,
`AccountingCard`, `LeadTimeStrip`, `Skeleton`, `carrySeason`/`seasonStartYearFromDate`.

## 8. Kept / demoted / deleted

- **Delete:** `AmortizationCard.svelte`, `AmortizationCardSkeleton.svelte` — verified
  used only by this page.
- **Keep (used by Dashboard too):** `NetProfitSkeleton` (still this page's figures
  pending state), `AccountingCard`, `LeadTimeStrip`, `AccountingCardSkeleton` (D6 note:
  this page stops using it once the new layout lands, but Dashboard still imports it —
  the parent's "delete only if unused after S3" condition is S3's to evaluate, not
  PSG-83's; deleting it here would break the current Dashboard).
- **Demoted:** `AccountingCard` and `LeadTimeStrip` move under the "Details" disclosure
  (Q8). Token pass: both already render on the S1 token set; the task is a stale-class
  grep (`shadow-`, `bg-primary`, old palette names), expected no-op or trivial fixes.
- **Dropped deliberately (user may overrule):** the compact Unrealized and Pending
  `AccountingCard`s and the season-investments `row/seat` list from the current net card.
  The brief's four-figure headline supersedes the card grid; Pending survives as a
  figure, cancelled/gifted value survives on the Dashboard and per-row in the table, and
  Q8's keep-list names only the Realized card. The pass-detail list (label · category ·
  row · seat) is data-entry detail, not accounting output.

## 9. Decisions summary (defaults I am proceeding on)

- **D1 waterfall = figures + MathBlock** (section 2) — no chart.
- **D2 title:** "Season accounting" / "Accounting" for `year=all`.
- **D3** AmortisationBlock keeps remaining/surplus + cleared-at; cumulative list drops.
- **D4** totals = always-visible labelled line, net labelled "Net before season pass".
- **D5** Net column: SOLD only; gifted suppresses price+net; else `—`.
- **D6** Unrealized/Pending cards and row/seat pass list dropped.
- **D7** matches fetched without `withResult`.
- **D8** one `seasonView` promise bundles amortization + matches + sales.
- **D9** strip/table preserve backend fixture order; no client sort.
- **D10** `tableGroups` added as a third pure helper.
- Adopted parent defaults untouched: Q3 (all fixtures divisor), Q4 (SOLD-only math),
  Q11 (precedence SOLD → PENDING → GIFTED → CANCELLED, per-sale rows), Q12 (all-time =
  figures + waterfall), Q13 (commission unnamed), legacy `?view=` alias kept.
- Skipped interactive grilling: every branch above has an explicit parent-spec default or
  is resolved here with evidence; the dispatcher asked for judgment calls to be reported,
  not blocking questions.

## 10. Testing

- **Vitest** (`web/`, node env, `npm test`): `accounting-view.spec.ts`, one nested
  `describe` per condition ("when …"), `it` titles state the outcome only:
  - `passCostPerMatch`: "when 19 matches" divides; "when zero matches" returns 0.
  - `stripSegments`: "when a match has no sale" status null; "when the break-even match
    is given" only that segment flagged; "when SOLD and PENDING coexist" status SOLD;
    "when two matches are given" segment count equals match count and order preserved.
  - `tableGroups`: "when a match has two sales" one group, input order; "when a match
    has no sales" omitted; "when a sale's match is missing from the list" appended last.
- **Playwright** new `e2e/tests/accounting.e2e-spec.ts` smoke: h1 "Season accounting";
  the strip (`getByRole('list', { name: 'Matchday strip' })`) has a listitem whose
  accessible name contains the seeded `E2E Test FC`; totals text "Net before season pass"
  visible (footer always rendered, so it holds with zero sales — the seed has exactly one
  upcoming match and specs run in parallel, so no sale is assumed). Existing `auth`,
  `sale`, `season-pass` must stay green.
- **Gate** in `web/`: `npm run check && npm run typecheck && npm test && npm run build &&
  test -f .svelte-kit/cloudflare/_worker.js`, plus e2e run for this slice.
- **Manual:** season switch via header updates all four streams; `?year=all` shows
  figures + waterfall + Details and hides strip/table/block; `?view=all-time` still resolves;
  no-pass state links to `/season` carrying `year`; break-even marker matches
  `Amortization.breakEven`; `prefers-reduced-motion` (no new transitions planned);
  keyboard: Details disclosure, strip labels announced, focus rings intact.
- No component harness exists (parent F2) — components covered by e2e + manual pass.

## 11. Parallelism and risks

Frontend-only; no backend task to order first. Disjoint from S3 (dashboard), S4 (matches),
S5 (sales), S7 (rest) — this slice touches only `routes/(app)/accounting/**`, three new
`$lib/ui` components, `accounting-view.ts` + spec, and one new e2e file. Shared files
(`sale-math.ts`, `season.ts`, tokens) are read-only here. Estimate ≈ 650 added lines
(with deletions netting near zero), under the 800 cap; fallback split documented in the
plan if a builder lands over. Risk: the totals footer and strip labels are new e2e surface
— the smoke test asserts only always-visible, seed-independent facts.
