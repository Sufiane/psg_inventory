# PSG-82 Sales page: season filter, status tabs, totals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Builder: `frontend-builder` only.

**Goal:** Rebuild the Sales ledger to the Stitch brief: status tabs, "Log sale" and "Import CSV", Season column under "All seasons", per-row profit as proceeds minus invest, totals footer following the filters.

**Architecture:** Pure helpers in `$lib/sales-view.ts` (status parse, filter, order, sort, tab hrefs) are vitest-covered; two thin components (`SalesToolbar`, `SalesTotals`) render them; `+page.svelte` keeps all drawer, panel and import logic untouched and swaps only its header, list pipeline, table and cards.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Tailwind 4, Vitest (node env, `src/**/*.spec.ts`), Playwright e2e. No backend change, no new dependency.

**Spec:** `docs/specs/2026-11-20-psg-82-sales-page-design.md` (read section 2: the year default and `year=all` already shipped with PSG-79, so there is no backend work; section 3: profit semantic). Parent: `docs/plans/2026-11-19-stitch-redesign-plan.md` slice S5 (its step 3 about `parseSeasonParam` and `/sales/grouped` = all seasons is superseded).

## Global constraints

Parent plan "Global Constraints" apply verbatim (pinned deps, no barrels, explicit return types, no single-letter names, no inline `if`, blank line before `if/for/return/throw`, no `!!`, numeric separators, no comments unless a non-obvious why, sentence-case copy, no exclamation marks). Tests: a `describe` per condition ("when ..."), `it` states only the outcome. Conventional commits, scope `web`, lowercase imperative, no PR numbers, attribution line from the harness. Branch `psg-82` (already correct). Linear: PSG-82 to In Progress before starting, In Review only when staged. Stage and stop for `/crit`; do not commit before the user reviews.

## Size and ticket split

One PR, frontend only, one actor (authenticated athlete), one layer (web). Estimate (added plus removed lines, tests included): about **650**, under the 800 cap.

| Task group | Lines |
|---|---|
| `sales-view.ts` plus spec | ~190 |
| `SalesToolbar`, `SalesTotals` | ~120 |
| `+page.svelte` (header out, pipeline, table, cards, empty states; mostly replacement) | ~280 |
| `+page.server.ts` (drop `salesGroup`, flatten) | ~15 |
| e2e extension | ~30 |

No split. Fallback if the builder lands above 800: S5a (tasks 1 to 3, helpers and components, ~310, unused until S5b) then S5b (tasks 4 to 5, ~340). Do not pre-split.

Follow-up tickets (not folded in, file as PSG issues assigned to the user): (1) forward `status` through update, delete and create redirects; (2) backend `GET /sales/all` only if six-season fan-out proves too few (new feature, backend ticket); (3) extract the edit drawer and new-sale panel from `+page.svelte` (parent F5, still deliberately untouched).

Backend / frontend independence: backend-only work does not exist; this is frontend-only. Dispatch `frontend-builder` alone.

## File map

- Create `web/src/lib/sales-view.ts`, `web/src/lib/sales-view.spec.ts`
- Create `web/src/lib/ui/SalesToolbar.svelte`, `web/src/lib/ui/SalesTotals.svelte`
- Modify `web/src/routes/(app)/sales/+page.server.ts`
- Modify `web/src/routes/(app)/sales/+page.svelte`
- Modify `e2e/tests/sale.e2e-spec.ts`

Existing helpers consumed, not changed: `saleNet`, `summarizeSales`, `SalesSummary` (`$lib/sale-math`), `StatusChip`, `FilterTabs`, `Button`, `money`, `signedMoney` (`$lib/format`), `seasonLabelFromDate`, `seasonLabel`, `profitTone` (`$lib/sale-helpers`), `SaleListItem`, `SaleStatus` (`$lib/types`).

---

## Task 1: sales-view helpers (TDD)

**Files:** create `web/src/lib/sales-view.ts`, `web/src/lib/sales-view.spec.ts`.

**Interfaces produced** (all explicit return types):

```ts
export type SaleSortKey = 'nbTickets' | 'listedPrice' | 'invest' | 'profit';
export type SaleSortDir = 'asc' | 'desc';
export type StatusFilter = SaleStatus | 'all';
export type StatusTab = { href: string; label: string; active: boolean };

export function parseStatusParam(url: URL): StatusFilter;
export function filterByStatus(sales: SaleListItem[], status: StatusFilter, keepId: string | null): SaleListItem[];
export function pendingFirst(sales: SaleListItem[]): SaleListItem[];
export function sortSales(sales: SaleListItem[], key: SaleSortKey | null, dir: SaleSortDir): SaleListItem[];
export function statusTabs(url: URL): StatusTab[];
```

- [ ] **Step 1: Write the failing spec.** Build `sale(overrides)` fixtures like `sale-math.spec.ts`. Describes:
  - `parseStatusParam`: "when the param is lower case gifted" returns `'GIFTED'`; "when the param is invalid" returns `'all'`; "when the param is absent" returns `'all'`.
  - `filterByStatus`: "when status is all" returns the input rows; "when status is SOLD" returns only SOLD; "when keepId is a PENDING row and status is SOLD" the kept row is included in original position order; "when keepId is null" no extra rows.
  - `pendingFirst`: "when statuses are mixed" PENDING rows first and relative order inside both groups kept; "when empty" returns `[]`; input array not mutated.
  - `sortSales`: "when key is null" returns input order; "when key is profit" orders by `profit - invest` (use two rows where raw `profit` and net order differ); "when dir is asc" ascending; input not mutated.
  - `statusTabs`: "when the url has year and edit" every tab keeps `year`, drops `edit` and `new`; "when status is sold" only the Sold tab is active and its href has `status=sold`; "when no status" All is active and its href has no `status`; labels in order All, Pending, Sold, Cancelled, Gifted; path is `/sales`.
- [ ] **Step 2:** Run `cd web && npx vitest run src/lib/sales-view.spec.ts`; expect FAIL.
- [ ] **Step 3:** Implement. `statusTabs` copies `url.searchParams`, deletes `edit`, `new`, sets or deletes `status`, returns `/sales` or `/sales?{qs}`. `pendingFirst` is a two-array partition. `sortSales` copies before sorting and reads `saleNet(sale)` for `'profit'`, `sale[key]` otherwise.
- [ ] **Step 4:** Rerun; expect PASS. `npm run typecheck`.
- [ ] **Step 5:** Stage (`git add`); do not commit yet.

## Task 2: SalesToolbar and SalesTotals

**Files:** create `web/src/lib/ui/SalesToolbar.svelte`, `web/src/lib/ui/SalesTotals.svelte`.

**Interfaces:**
- `SalesToolbar` props `{ tabs: StatusTab[]; canCreate: boolean; showActions: boolean; newHref: string; onImport: () => void }`. Renders `h1` "Sales"; `FilterTabs` with `label="Status"`; when `showActions`: `<button type="button">` "Import CSV" (secondary classes reused from the current page button) and, if `canCreate`, `Button href={newHref}` "Log sale", else the existing sentence ("Can't add new sales for this season here, use Import CSV instead." keep original wording and punctuation).
- `SalesTotals` props `{ summary: SalesSummary; variant: 'row' | 'block'; columns?: { season: boolean } }`. `row`: a `<tfoot><tr>` aligned to the table columns (Tickets total, Price cell empty, Invest total, Profit net total, label cell "Totals"; a second line under the label reads "Net before season pass"). `block` (mobile): `dl` with Tickets, Proceeds (sold), Invest (sold), Net before season pass. Money via `money`/`signedMoney`; net tone `text-positive-strong`, `text-negative-strong` or `text-ink` by sign.

- [ ] **Step 1:** Write both components. No data fetching, no derived sale logic beyond formatting `SalesSummary`.
- [ ] **Step 2:** `cd web && npm run check`; expect 0 errors.
- [ ] **Step 3:** Stage.

## Task 3: load cleanup

**Files:** modify `web/src/routes/(app)/sales/+page.server.ts`.

- [ ] **Step 1:** Remove `salesGroup` (variable, the `SalesGroupListItem` import, the returned property). In the `season === currentSeason` branch keep `/sales/grouped` and assign `sales = [...grouped.pending, ...grouped.terminal]` only. Leave `year`, `season`, `canCreate`, passes, matches, recipients, edit loading and all three actions byte-identical.
- [ ] **Step 2:** `npm run check`; expect errors only in `+page.svelte` (fixed in Task 4).
- [ ] **Step 3:** Stage.

## Task 4: page rewrite

**Files:** modify `web/src/routes/(app)/sales/+page.svelte`. Do not edit the `editPanel` and `newSalePanel` snippets, `urlWith*` helpers, the `$effect` blocks, `track*`, `confirm*`, `onWindowKeydown`, `lifecycleNote`.

- [ ] **Step 1: State and pipeline.** Delete local `SortKey`/`SortDir` types (import `SaleSortKey`, `SaleSortDir`), the three inline sorts (`sortedSales`, `pendingSales`, `terminalSales`), `sectionLabel`. Add:
  - `statusFilter = $derived(parseStatusParam(page.url))`
  - `rows = $derived(sortSales(pendingFirst(filterByStatus(data.sales, statusFilter, editId)), sortKey, sortDir))`
  - `summary = $derived(summarizeSales(rows))`
  - `showSeason = $derived(data.season === 'all')`, `columnCount = $derived(showSeason ? 8 : 7)`
  - `seasonName = $derived(data.season === 'all' ? 'all seasons' : seasonLabel(data.season))`
  - `tabs = $derived(statusTabs(page.url))`
  - Keep `SORT_LABELS`, `toggleSort`, `ariaSort`, `arrow`, `onMobileSortChange` as they are (they only depend on `sortKey`/`sortDir`).
- [ ] **Step 2: Header.** Replace the inline title and buttons block with `<SalesToolbar {tabs} canCreate={data.canCreate} showActions={!isNew} newHref={urlWithNew(true)} onImport={() => (importOpen = true)} />`. The `ImportSalesModal` and `{#if isNew}` panel render stay.
- [ ] **Step 3: Empty states.** Zero `data.sales`: "No sales in {seasonName}." (sentence case, first letter capitalised). Zero `rows` but sales exist: "No {status lowercased} sales in {seasonName}."
- [ ] **Step 4: Row presentation.** One snippet change each for `saleRow` and `saleCard` (keep the snippet names and the edit-link markup). Cells in DOM order: Match (opponent, `matchDate` via `shortDate` beneath when present), Season (`{#if showSeason}`, `seasonLabelFromDate(sale.matchDate)`), Tickets, Status (`StatusChip` replacing the inline pill, lifecycle note kept), Price, Invest, Profit, actions. By status: SOLD and PENDING show `signedMoney(saleNet(sale))` with `profitTone`; CANCELLED shows an em dash in `text-sunk` for Profit and keeps price; GIFTED replaces the Price, Invest and Profit cells with one cell `colspan="3"` reading "Gifted to {sale.Gift?.Recipient.name}" (fall back to "Gifted" when `Gift` is null). Mobile card applies the same rules in its `dl`.
- [ ] **Step 5: Remove grouped rendering.** Delete both `pendingSales !== null && terminalSales !== null` branches (mobile lists and table section rows) in favour of one `{#each rows as sale (sale.id)}` per layout. The drawer row `colspan` uses `columnCount`.
- [ ] **Step 6: Footer.** Table: `<tfoot>` rendering `SalesTotals variant="row"` after the body, only when `rows.length > 0`. Mobile: `SalesTotals variant="block"` below the card list, `sm:hidden`.
- [ ] **Step 7:** Header cell "Opponent" becomes "Match". Add a Season `th` (`{#if showSeason}`) after it. Remove now-unused imports (`statusPill` if no longer referenced; keep it where the edit panel still uses it).
- [ ] **Step 8:** `cd web && npm run check && npm run typecheck && npm test`; expect PASS, zero unused-import warnings.
- [ ] **Step 9:** Stage.

## Task 5: e2e extension and gate

**Files:** modify `e2e/tests/sale.e2e-spec.ts`. `sale` is already in `testMatch` (`e2e/playwright.config.ts`), no config change. Existing steps stay unchanged.

- [ ] **Step 1:** In the first scenario, after the row is visible and contains `PENDING`: click `getByRole('link', { name: 'Pending' })`, expect the row visible; click `getByRole('link', { name: 'Sold' })`, expect the row not visible; click `getByRole('link', { name: 'All' })` before continuing so later steps are unchanged. Use `getByRole('navigation', { name: 'Status' })` as the scope so the header nav and the tabs do not collide.
- [ ] **Step 2:** Add a totals assertion in the same scenario: the footer region contains "Net before season pass".
- [ ] **Step 3:** Gate in `web/`: `npm run check && npm run typecheck && npm test && npm run build && test -f .svelte-kit/cloudflare/_worker.js`. Then run e2e `authenticated` project (`sale`, `season-pass`) per the repo's e2e command; expect green. Row accessible-name regex (`opponent.*price`) must still pass: opponent cell precedes price cell.
- [ ] **Step 4:** Manual pass (dev server with seeded data): current season default (no `year`); header selector to a past season and "All seasons" (Season column appears, drawer row spans 8); tabs filter without refetch and totals follow; open edit on a PENDING row then switch to Sold tab, the drawer row stays; GIFTED row reads "Gifted to {name}" with no price or net; CANCELLED row shows an em dash; row Profit equals price after 12 percent commission minus invest; keyboard-only tab order and Escape still close the drawer; 375 px width cards and mobile totals block.
- [ ] **Step 5:** Stage everything; message the user that it is staged and ready for `/crit`. Suggest `/show-me` only if the diff turned out large. Move PSG-82 to In Review. Conventional commit once approved: `feat(web): rebuild sales page with status tabs and totals`.

## Acceptance

- Absent `year` shows the current season; header selector "All seasons" shows the Season column; no per-page season control remains.
- Tabs All, Pending, Sold, Cancelled, Gifted filter client-side via `?status=`; `load` does not read it.
- Row Profit is net of invest; footer proceeds and invest count SOLD rows only and is labelled "Net before season pass"; footer follows the active tab.
- All pre-existing e2e steps pass untouched; edit drawer, new-sale panel and import modal behave as before.

## Self-review

- Spec coverage: section 3 (Task 4 step 4, Task 2), section 4 (Task 3), section 5 (Tasks 1, 2, 4), section 8 (Tasks 1, 5). D-S2 keepId (Task 1, Task 4 step 1), D-S6 net sort (Task 1).
- Type consistency: `SaleSortKey`, `SaleSortDir`, `StatusFilter`, `StatusTab` defined once in Task 1 and consumed by Tasks 2 and 4. `SalesSummary` already exists in `sale-math.ts`.
- Risk: `+page.svelte` is ~1 190 lines with e2e-load-bearing markup; Task 4 limits edits to the list region and header, and Task 5 runs the full e2e before staging.
