# PSG-82 Sales page: season filter, status tabs, totals footer: design

Status: draft for review. Slice S5 of `docs/specs/2026-11-19-stitch-redesign-design.md`
(Q2 decided there; Q4 recommended there and taken here). Builds on PSG-79
(`docs/specs/2026-11-20-psg-79-app-shell-season-selector-design.md`), already merged on this
branch. Plan: `docs/plans/2026-11-20-psg-82-sales-page-plan.md`.

Scope: `web/` only, one PR. Branch `psg-82`. No backend, schema or API change.

## 1. Goal

Sales ledger matching the Stitch brief: title, status tabs, "Log sale" and "Import CSV", a table
whose Season column appears under "All seasons", per-row net, and a totals footer that follows
the active filters. The season is chosen by the global header selector (PSG-79), not on the page.

Out of scope: edit drawer, new-sale panel and import modal logic (token restyle already came with
S1; no edits here), `/sales/new` and `/sales/[saleId]` routes, any backend endpoint, CSV export,
persisting `status` across action redirects (section 7).

## 2. Finding: the year contract and the backend are already done

The ticket text ("No year now means current season, `year=all` is explicit") and the parent plan
(S5 step 3, "default current season, `all`") assume the Sales load still maps absent `year` to
`/sales/grouped` = all seasons. Verified against the code on this branch, that is stale:

- Backend `getSalesGrouped` already scopes to the **current season window**
  (`getSeasonWindow(seasonStartYearFromDate(new Date()))`). PSG-79 section 2 recorded this.
- `web/src/routes/(app)/sales/+page.server.ts` already uses `resolveSeason(url, true)`:
  absent or current season means `/sales/grouped` (current), `all` means a six-season fan-out over
  `/sales/season/:y` (PSG-79 D5), a past year means `/sales/season/:y`. It already returns
  `season: SeasonYear | 'all'` and `canCreate = season === 'all' || season === currentSeason`.

So there is **no backend change, no API-shape change and no year-default change** in this ticket.
The load only loses `salesGroup` (section 4). The one residual risk is Q-A from PSG-79
(fan-out covers six seasons only; "All seasons" is honest only while the selector offers six).
Not reopened here; restated in section 7 as a follow-up candidate.

## 3. Per-row profit semantic change (frontend only)

Today the table's "Profit" cell shows `sale.profit`, which the backend stores as
`listedPrice * (100 - PSG_COMMISSION) / 100`: proceeds after commission, before the ticket cost.
The brief wants profit as what the athlete actually keeps on the row.

- Row "Profit" becomes `saleNet(sale) = sale.profit - sale.invest` (helper exists in `sale-math.ts`).
- Column header stays "Profit" (brief wording). The stored `profit` field and the API are untouched.
- Presentation per status: SOLD and PENDING show the signed net (PENDING in warning tone, as
  `profitTone` does today: it is a projection); CANCELLED shows an em dash; GIFTED shows no price
  and no net, one cell spanning Price, Invest and Profit (colspan 3) reads "Gifted to {recipient name}".
- Sorting by the Profit column sorts by the displayed value (net), not `profit`.
- Footer (Q4, taken as recommended): tickets over all filtered rows; proceeds, invest and net over
  **SOLD rows only** (`summarizeSales`), net labelled "Net before season pass". Pending rows can
  therefore show a net that the footer does not include; the explanation is the
  footer label and the status chip.
- This changes numbers users already know (every row's figure drops by its invest). Accepted as
  the explicit intent of the ticket; no migration, no flag.

## 4. Data and load

`+page.server.ts` keeps its fetch logic. Changes:

- Return flat `sales` only. For the current season the grouped call is kept and flattened
  (`[...pending, ...terminal]`) so server order is unchanged; `salesGroup` is dropped from the
  returned data and from `SalesGroupListItem` consumers on this page.
- The other three returned values (`season`, `year`, `canCreate`) keep meaning and names. Action
  redirects keep forwarding `year` verbatim; they do not forward `status` (section 7).
- `status` is never read by `load` (client-side filter on already-loaded rows; no refetch).

## 5. Page structure

Pure module `$lib/sales-view.ts`:

- `parseStatusParam(url): SaleStatus | 'all'`: case-insensitive `status` param, invalid or
  absent means `'all'`.
- `filterByStatus(sales, status, keepId)`: `'all'` returns input; otherwise the matching rows plus
  the row with id `keepId` regardless of status, so an open edit drawer never vanishes under a
  filter (D-S2).
- `pendingFirst(sales)`: stable partition, PENDING first, rest in input order.
- `sortSales(sales, key, dir)`: `key` is `nbTickets | listedPrice | invest | profit`; `profit`
  sorts by `saleNet`. Replaces the duplicated inline sorts (three copies today).
- `statusTabs(url): { href; label; active }[]`: All, Pending, Sold, Cancelled, Gifted. Href is
  `/sales` plus the current params minus `edit` and `new`, with `status` set (lower case) or
  removed for All. `year` and every other param are kept as they are.

Components (props only, no data fetching):

- `SalesToolbar.svelte`: `h1` "Sales", `FilterTabs` (label "Status"), "Import CSV" (secondary,
  button) and "Log sale" (primary link, replaces "+ New sale") or, when `canCreate` is false, the
  existing explanatory sentence. Hidden actions while the new-sale panel is open (as today).
- `SalesTotals.svelte`: renders a `SalesSummary` as table `tfoot` cells on desktop and a compact
  summary block under the mobile cards.

`+page.svelte` changes: remove the inline header and the two grouped render paths ("Pending - N
sales" / "Completed - N sales" section rows; the tabs replace them, pending-first ordering stays);
one `rows = sortSales(pendingFirst(filterByStatus(...)))` pipeline; table columns in this DOM
order: Match (opponent, then date beneath), Season (only when `data.season === 'all'`, from
`seasonLabelFromDate(matchDate)`), Tickets, Status (`StatusChip` plus the existing lifecycle
note), Price, Invest, Profit, actions. Opponent precedes price in DOM order, which e2e's row
regex relies on. Mobile cards get `StatusChip` and the same net. Edit link, `aria-sort`,
`aria-expanded`, drawer snippets, keyboard Escape handling, import modal wiring: untouched.
Empty states: "No sales in {season label}." and, when a status filter hides everything,
"No {status} sales in {season label}."

Note the existing e2e: `colspan="7"` on the drawer row becomes the live column count (7 or 8).

## 6. Decisions taken without user input (flagged)

- **D-S1 (flag, behaviour):** row Profit = proceeds minus invest, footer SOLD-only and labelled
  "Net before season pass" (parent Q4 recommendation, ticket confirms the row part).
- **D-S2:** the row being edited stays visible under any status filter.
- **D-S3:** section headers ("Pending - N sales") removed; status tabs plus pending-first order
  replace them. Reversible, markup only.
- **D-S4:** `salesGroup` dropped from load output (no consumer left). Not an API change.
- **D-S5:** the grouped call stays for the current season (keeps server ordering) instead of
  switching to `/sales/current-season`.
- **D-S6:** sort-by-Profit uses net.
- **D-S7 (flag, contradicts ticket premise):** no backend year-default or `year=all` change;
  already shipped by PSG-79 (section 2).

## 7. Known gaps (not footnotes: follow-up tickets)

- Status filter is dropped by update, delete and create redirects (they forward only `year`);
  e2e and the common flow land on All. Follow-up: forward `status`. Small, web only.
- "All seasons" covers six seasons, one GET each. Follow-up only if six proves too few: a
  backend `GET /sales/all` (new feature, own ticket).
- Totals footer counts only loaded rows; under "All seasons" that is the six-season window.

## 8. Testing

- Vitest (node env, pure): `sales-view.spec.ts`, nested `describe` per condition, `it` states
  outcome only. Cases: `parseStatusParam` (lower case, invalid, absent); `filterByStatus` (all,
  SOLD, `keepId` outside the filter); `pendingFirst` (mixed, stability); `sortSales` (profit sorts
  by net, asc/desc); `statusTabs` (keeps `year`, drops `edit` and `new`, All removes `status`,
  active flag).
- No component harness exists (parent F2): toolbar, totals and page covered by manual pass plus
  e2e. Manual: All seasons shows the Season column and the totals change with each tab; a gifted
  and a cancelled row render as specified; keyboard-only tab order; mobile width.
- E2E `sale.e2e-spec.ts` extended (row stays; Pending tab shows it, Sold tab hides it). Existing
  steps unchanged. `sale` is already in `testMatch`, no config edit.
- Gate in `web/`: `npm run check && npm run typecheck && npm test && npm run build && test -f
  .svelte-kit/cloudflare/_worker.js`; then e2e `sale` and `season-pass`.
