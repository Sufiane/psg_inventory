# PSG-80 Dashboard redesign - design

Slice S3 of `docs/specs/2026-11-19-stitch-redesign-design.md` (section 6 "Dashboard"
and the token/primitives sections apply unchanged). Plan:
`docs/plans/2026-11-20-psg-80-dashboard-redesign-plan.md`.

Scope: `web/` only, route `(app)/dashboard` plus one new component and one new pure
module. No backend change. Depends on PSG-77 (`matchId` on sales) and PSG-79 (shell,
season selector), both on `main`. S1 primitives (`MathBlock`, `BreakEvenBar`,
`StatusChip`, `sale-math.ts`) already exist.

## 1. Goal

Replace the current "Current season" page with the Stitch Dashboard: net realized profit
with the math beneath, pending / cancelled / gifted figures, break-even bar, five most
recent sales, "Log sale" action. Excluded Stitch placeholders: zero "Ticket invest",
profit on cancelled rows, Export CSV.

## 2. Data: existing endpoints cover everything

| Need | Source | Notes |
|---|---|---|
| Net, proceeds, invest, pass cost | `GET /accounting/current-season` or `/season/:year` -> `TimePeriodAccounting` | `realized.totalProfit - realized.totalInvest - totalSeasonInvestment` (same formula as today) |
| Pending | same payload, `pending` | amount `totalProfit`, count `totalSales` |
| Cancelled | same payload, `cancelledFrom(unrealized, gifted)` (S1) | gifted is a subset of unrealized |
| Gifted | same payload, `gifted.totalSales` | count only, no amount |
| Break-even | `GET /accounting/amortization/:year` -> `Amortization` | `progress`, `hasPass`, `remaining`, `surplus`, `breakEven` |
| Recent sales | `GET /sales/current-season` or `/season/:year` -> `SaleListItem[]` | `matchId`, `opponent`, `matchDate`, `createdAt`, `Gift.Recipient.name` all present at runtime (`createdAt` typed optional) |

Gaps: none blocking. Two soft ones, both handled client-side: `createdAt` is typed
optional on `SaleListItem` (fall back to `matchDate`, then stable input order); the sales
endpoint has no limit param, so the full season list is fetched and sliced to 5 (small:
one season per user). A `?limit=` param would be a separate backend ticket if ever needed.

## 3. Design

Load (`+page.server.ts`): resolve season as today; return
`{ season, accounting, amortization, sales }`, the last three unawaited. The `matches`
stream and its fetch are dropped (Upcoming matches moves to Matches). The `ask` action is
untouched.

Page layout, top to bottom (all inside the shell's content area):

1. Header: h1 "Dashboard", muted subtitle with the season label, `Button` "Log sale"
   linking `/sales/new`.
2. Net card (`aria-labelledby`): h2 "Net realized profit", figure in display size
   (`font-mono text-5xl`), tone by sign (`positive-strong` / `negative-strong` / `ink`),
   `signedMoney`. Under it `MathBlock`: Realized proceeds (SOLD) +, Ticket invest -,
   Season pass -, result "Net realized profit". Every figure on the page traces to a line.
3. Three tiles: Pending (`warning`), Cancelled (`sunk`), Gifted (`gift`). Each: label,
   amount (Gifted has none), "N sales". Colour is never the only signal: label and count
   always present.
4. Break-even card: h2 "Season pass recovery", `BreakEvenBar`, caption from
   `breakEvenCaption` (pass recovered with surplus / amount still to recover / nothing).
5. Recent sales (`RecentSales`): 5 rows, each a link to `/matches/:matchId`: opponent and
   `shortDate(matchDate)`, tickets, `StatusChip`, listed price, net. CANCELLED row: no
   price, no net. GIFTED row: "Gifted to {name}", no price, no net. Footer link "All sales"
   to `/sales`.
6. `AskCard`, restyled only, last (Q8 decided: keep).

Each `{#await}` keeps its own skeleton and its own `role="alert"` error, so one failing
endpoint does not blank the page.

Removed: pass description list, glossary and its CSS, Upcoming matches, `AccountingCard`
use on this page (component stays for Accounting).

## 4. Decisions made on judgment (flag to user)

- D1 Counts are sales, not tickets, on all three tiles. `cancelledFrom` can only produce a
  sales count, so mixing sales (cancelled) and tickets (pending) would mislabel. The S3
  plan text said "ticket count" for Pending; overridden for consistency.
- D2 No pass: the "Season pass" MathBlock line is omitted and a one-line note with a link
  to `/season` renders under the block, instead of the plan's "Not set" line.
  `MathBlock` only takes numeric values; changing it would collide with S4/S6 which also
  consume it, and a `-0,00 EUR` line is the placeholder defect we are removing. Net is
  still correct (pass cost 0).
- D3 New pure module `web/src/lib/dashboard.ts` (`recentSales`, `breakEvenCaption`,
  `netTone`) with a spec, rather than inline logic, so the "no new pure logic" claim in
  the parent plan is corrected and the sort fallback is tested. Separate file, not
  `sale-math.ts`, to avoid conflicts with parallel slices.
- D4 Recent = latest by `createdAt` (when the sale was logged), not by match date: a
  "recent activity" list. Ties and missing `createdAt` fall back as in section 2.
- D5 Recent rows link to the existing `/matches/[matchId]` route (works now; S4 reshapes
  it later without breaking the URL).
- D6 PENDING row net uses `profitTone` (warning), i.e. an expected net, not a realized one.
- D7 Season subtitle added (not in brief) so the page states which season the global
  selector chose; 1 line, easy to drop.

## 5. Testing

Vitest: `dashboard.ts` branches. Playwright: new `e2e/tests/dashboard.e2e-spec.ts` smoke.
Gate per parent plan: `npm run check && npm run typecheck && npm test && npm run build &&
test -f .svelte-kit/cloudflare/_worker.js` in `web/`.

## 6. Out of scope

Backend changes, Export CSV, light theme, deleting `AccountingCard*` / `AmortizationCard*`
(S6 owns it), glossary relocation.
