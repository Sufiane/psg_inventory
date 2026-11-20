# Stitch redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **One slice per run.**

**Goal:** Re-skin the web app to the Midnight Carmine Terminal design system and rebuild Dashboard, Matches, Sales and Accounting to the Stitch brief.

**Architecture:** Token-first: keep Tailwind `@theme` token names, change values, split `primary` into text (`primary`) and fill (`brand`). Shared primitives and pure helpers land first (S1, S2); page slices then run in parallel, each confined to its own route directory.

**Tech Stack:** SvelteKit 2.61.1, Svelte 5.56.0, Tailwind 4.3.0, Vitest 5.0.0, Playwright (e2e/), Cloudflare adapter, `@fontsource-variable/syne` 5.3.0, `@fontsource-variable/space-grotesk` 5.3.0.

**Spec:** `docs/specs/2026-11-19-stitch-redesign-design.md` (token tables, per-page gaps, open questions Q1 to Q14). Brief: `.context/stitch/design-brief.md`.

## Global Constraints

- Dependencies pinned exactly: no `^`, `~`. After `npm install`, rewrite `package.json` to the resolved version (`5.3.0` for both fonts).
- Fonts self-hosted via fontsource, imported from JS in `+layout.svelte`, never CSS `@import` and never a CDN tag.
- No barrel files; import from the specific file. Explicit return types on every function. No single-letter names except `i/j/k` in indexed loops. No inline `if`; blank line before `if/for/while/return/throw`. No `!!`. Numeric separators on literals of 5+ digits. `readonly` on injected members. Error codes are snake_case. No comments unless a non-obvious why.
- Copy: sentence case headings and buttons; chips may be uppercase via CSS only (DOM text stays the enum literal). French number format via `$lib/format.ts`. No marketing words, no exclamation marks.
- Banned content (brief decision 2): escrow, bank/SEPA/IBAN, fees, webhooks/telemetry, hashes, tax/fiscal/audit/compliance wording, "Tour Demo", "Split-Pass", "Syndicate", resale channels, seat/row/block details on match screens, stadium imagery, asking-price/listing/surge, Yield Multiplier, footer copyright, glow shadows, blurred blobs, "Export CSV", "+ Log sale".
- Statuses: only PENDING, SOLD, CANCELLED, GIFTED. Carmine is brand only, never loss. Negative profit uses `negative` (`#ffb4ab`).
- Sign and label always accompany colour (WCAG 2.2 AA; `prefers-reduced-motion` respected).
- Conventional commits, lowercase imperative subjects, scope `web` (or `sales` for D-API-1). End with the attribution line the harness provides. No PR numbers in titles or bodies. Branch name: Linear key lowercase, zero-padded to two digits (`psg-NN`); verify before first push.
- Per-slice gate, run in `web/`: `npm run check && npm run typecheck && npm test && npm run build && test -f .svelte-kit/cloudflare/_worker.js`. Build exit 0 alone is not evidence. Run e2e (`e2e/`) for any slice marked so.
- Tests: Jest-style nesting per `CLAUDE.md`: a `describe` per condition ("when ..."), `it` states only the outcome.
- Stage and stop for the user to run `/crit`; do not commit until told.

---

## Ticket split and dependencies

Estimated total: **about 3 400 lines** (tests, docs included), over the 800 cap, so split. Parent Linear issue "Stitch redesign" is an XL (8): file the slices below as sub-issues with `blockedBy` relations in the same turn, team "PSG Inventory", assignee "me".

| Slice | Layer / actor | Lines | Depends on | Parallel with |
|---|---|---|---|---|
| S0 `feat(sales): expose matchId on formatted sales` | backend, user | ~50 | none | S1, S2 |
| S1 tokens, fonts, primitives, pure helpers | web, all | ~330 | none | S0 |
| S2 shell, nav, season selector, load plumbing | web, authenticated | ~370 | S1 | S0 |
| S3 Dashboard | web, user | ~450 | S2 | S4, S5, S6, S7 |
| S4 Matches (master/inspector) | web, user | ~600 | S2, S0 | S3, S5, S6, S7 |
| S5 Sales | web, user | ~700 | S2 | S3, S4, S6, S7 |
| S6 Accounting | web, user | ~650 | S2, S0 | S3, S4, S5, S7 |
| S7 Season, auth, admin, landing restyle | web, user+public+admin | ~300 | S1 (S2 for shell) | S3 to S6 |

Follow-up tickets, not folded in:
- F1 Light theme (only if Q1 answer is "keep").
- F2 Component test harness (jsdom or Playwright CT); none exists, so UI components are covered by e2e only.
- F3 Font preload via `resolve(..., { preload })` in `hooks.server.ts` if CLS shows.
- F4 Rename `font-mono` usages to a `font-numeric` utility and drop the `--font-mono` alias.
- F5 Extract the Sales edit drawer and new-sale panel from the 1 228-line `sales/+page.svelte` (deliberately untouched by S5).
- F6 Account for the 12 % commission in UI copy (Q13) if the user wants it.

Each slice is independently mergeable. S3 to S7 touch disjoint route directories; the only shared files are created in S1 and S2, so parallel builders do not conflict. Backend work is S0 only (builder: `backend-builder`); everything else is frontend.

---

## S0: expose matchId on FormattedSale (backend)

**Files:**
- Modify: `src/api/sales/interfaces/sales.service.interface.ts:10` (`FormattedSale`: stop omitting `matchId`)
- Modify: `src/api/sales/sales.service.ts:95` (`formatSale`: omit `['Match','userId']` only)
- Modify: sales service and controller specs that assert the formatted shape (find with `grep -rn "formatSale\|FormattedSale" src --include='*.spec.ts'`)
- Modify: `web/src/lib/types.ts` (`MatchSale`, `SaleListItem`: add `matchId: MatchId`)

**Interfaces:**
- Produces: every sale object from `/sales/current-season`, `/sales/season/:year`, `/sales/grouped`, `/sales/match/:id` has `matchId: MatchId`. S4 and S6 consume `sale.matchId`.

- [ ] **Step 1:** Update the sales service spec: describe "when formatting a sale" with an `it` asserting the result contains `matchId` equal to the stored id, and still omits `userId` and `Match`. Run `npx jest src/api/sales` (or the repo's runner); expect FAIL.
- [ ] **Step 2:** Make the two edits above; add `matchId: MatchId` to the web types.
- [ ] **Step 3:** Run the backend sales specs and `npm run lint`; expect PASS. Run `cd web && npm run typecheck`; expect PASS.
- [ ] **Step 4:** Stage; commit message `feat(sales): expose matchId on formatted sales`.

Acceptance: additive only (no field removed), no cache-key change, existing e2e unaffected. If D-API-1 is rejected, S4/S6 use a `matchKey(sale)` join on `matchDate` and `opponent.name`, one helper, one spec; S0 is dropped.

---

## S1: tokens, fonts, primitives, pure helpers

**Files:**
- Modify: `web/package.json`, `web/package-lock.json` (two fontsource packages, pinned)
- Modify: `web/src/app.css` (replace palette; keep skeleton, focus, form, reduced-motion rules)
- Modify: `web/src/app.html` (theme-color; remove inline theme script if dark-only)
- Modify: `web/src/routes/+layout.svelte` (font imports only; shell is S2)
- Modify: `web/src/lib/ui/Button.svelte`, `Skeleton.svelte` (token check)
- Create: `web/src/lib/ui/StatusChip.svelte`, `MathBlock.svelte`, `BreakEvenBar.svelte`, `FilterTabs.svelte`
- Create: `web/src/lib/sale-math.ts`, `web/src/lib/sale-math.spec.ts`
- Modify: `web/src/lib/season.ts` (`seasonOptions`), `web/src/lib/season.spec.ts` (create)
- Modify: `web/src/lib/sale-helpers.spec.ts` (only if class strings change)
- Delete (dark-only): `web/src/lib/ui/ThemeToggle.svelte` is removed in S2 together with its only consumer.

**Interfaces:**
- Produces (exact):
  - `seasonOptions(now: Date, count: number): { year: SeasonYear; label: string }[]`, newest first, starting at `seasonStartYearFromDate(now)`.
  - `saleNet(sale: Pick<SaleListItem, 'profit' | 'invest'>): number` = `profit - invest`.
  - `summarizeSales(sales: SaleListItem[]): SalesSummary` where `SalesSummary = { tickets: number; ticketsByStatus: Record<SaleStatus, number>; proceedsSold: number; investSold: number; netSold: number }`; proceeds, invest, net count **SOLD rows only**; tickets counts all given rows.
  - `dominantStatus(statuses: SaleStatus[]): SaleStatus | null` precedence SOLD, PENDING, GIFTED, CANCELLED; empty gives `null`.
  - `groupSalesByMatch(sales: SaleListItem[]): Record<string, SaleListItem[]>` keyed by `matchId` (plain object so it serialises from `load`); needs S0's `matchId`.
  - `cancelledFrom(unrealized: Accounting | null, gifted: Accounting | null): { count: number; amount: number }` = unrealized minus gifted (gifted is a subset, per `types.ts`); nulls count as 0.
  - `StatusChip` props `{ status: SaleStatus }`; `MathBlock` props `{ lines: { label: string; value: number; sign?: 'plus' | 'minus' }[]; resultLabel: string; result: number }`; `BreakEvenBar` props `{ progress: number; hasPass: boolean }`; `FilterTabs` props `{ label: string; tabs: { href: string; label: string; active: boolean }[] }`.

- [ ] **Step 1: Write failing specs.** `sale-math.spec.ts` describes: "when summarizing sales" with "when a PENDING and a SOLD sale are given" (proceeds and invest only from SOLD, tickets from both); "when no sales" (all zeros); `saleNet` "when invest exceeds profit" (negative number); `dominantStatus` "when SOLD and CANCELLED coexist" (SOLD), "when only GIFTED and CANCELLED" (GIFTED), "when empty" (null); `groupSalesByMatch` "when two sales share a matchId" grouped together, "when empty" empty object; `cancelledFrom` "when gifted is a subset of unrealized" (amount and count subtract), "when both are null" (zeros). `season.spec.ts`: "when now is in November 2026" first option year 2026, label `2026/2027`; "when now is in March 2027" first option year 2026 (not 2027; this is the calendar-year bug being fixed); count respected.
- [ ] **Step 2:** Run `cd web && npx vitest run src/lib`; expect FAIL (modules missing).
- [ ] **Step 3:** Implement the two modules to the signatures above.
- [ ] **Step 4:** Run `npx vitest run src/lib`; expect PASS.
- [ ] **Step 5: Fonts.** `cd web && npm install -E @fontsource-variable/syne@5.3.0 @fontsource-variable/space-grotesk@5.3.0`; confirm both entries in `package.json` have no caret; add the two imports to `+layout.svelte`.
- [ ] **Step 6: Tokens.** Rewrite `app.css` `@theme` with the spec section 3 values as the only set; add `--color-brand`, `--color-brand-hover`, `--color-on-brand`, `--font-sans`, `--font-display`, redefine `--font-mono`, override `--radius-lg`/`--radius-md`; add base-layer `h1,h2,h3` display font; delete both dark override blocks and the dark skeleton rules; `:root { color-scheme: dark }`. Update `app.html` `theme-color` to `#070e1c` and delete the inline script.
- [ ] **Step 7: Contrast check.** Measure every `-strong` token and each chip (`color / color at 15% on surface`) with a WCAG luminance script; record results in the PR description; adjust lightness until text pairs are at least 4.5:1 and control borders at least 3:1. Verify `tnum` alignment of Space Grotesk in a figures column (screenshot via `/run`).
- [ ] **Step 8: Primitives.** `Button.svelte` base class becomes `bg-brand text-on-brand hover:bg-brand-hover`; build `StatusChip` (label text always rendered, `text-xs`, uppercase via CSS, tone from `statusPill`), `MathBlock`, `BreakEvenBar` (`role="progressbar"` with `aria-valuenow`; when `hasPass` is false render the "No season pass set" message with link to `/season` instead of a bar), `FilterTabs` (`<nav aria-label>` with `aria-current="page"` on active). Replace remaining `bg-primary text-surface` in other files with the brand classes only where it is a filled control (grep: 9 files); links keep `text-primary`.
- [ ] **Step 9:** Run the per-slice gate. Visual check each existing page renders on navy with no light-on-light remnants.
- [ ] **Step 10:** Stage; commit `feat(web): apply midnight carmine tokens and self-hosted fonts`.

Tests: new vitest specs above; existing `sale-helpers.spec.ts` stays green. e2e: run all three specs (labels unchanged).
Acceptance: app builds, `_worker.js` exists, network panel shows zero third-party font requests, all text pairs at least 4.5:1, brand fill never used as text, only four statuses styled, no shadow utilities remain, both fonts pinned exact in the lockfile.

---

## S2: shell, nav, season selector, load plumbing

**Files:**
- Modify: `web/src/routes/+layout.svelte`
- Create: `web/src/lib/ui/SeasonSelect.svelte`, `web/src/lib/ui/UserMenu.svelte`
- Delete: `web/src/lib/ui/ThemeToggle.svelte`
- Modify: `web/src/lib/season.ts` (`parseSeasonParam(url: URL): SeasonYear | 'all' | null`, keeps `parseSeasonYearParam`) and `season.spec.ts`
- Modify: `web/src/routes/(app)/dashboard/+page.server.ts` (accept `year`: paths `/accounting/season/:year`, `/matches/season/:year` when set)
- Modify: `web/src/routes/(app)/accounting/+page.server.ts` (`year` present means season view; `year=all` means all-time; drop the `view` param, keep reading it as a legacy alias for one release)

**Interfaces:**
- Consumes: `seasonOptions` (S1).
- Produces: header writes `?year=<n>` or `?year=all`; nav hrefs carry the current `year`; `parseSeasonParam` returns `null` for absent or invalid.

- [ ] **Step 1: Failing spec** for `parseSeasonParam`: "when year is 2025" gives 2025; "when year is all" gives `'all'`; "when year is 0, abc or absent" gives `null`; "when year has 5 digits" gives `null`.
- [ ] **Step 2:** Run `npx vitest run src/lib/season.spec.ts`; expect FAIL. Implement; expect PASS.
- [ ] **Step 3: Shell.** Header: brand link (Syne, sentence case), nav (five items, Admin for ADMIN), `SeasonSelect` and `UserMenu` on the right. Active item: `bg-surface-strong` plus `border-b-2 border-brand`; inactive `text-ink-muted`. Keep `aria-label="Primary"` and `aria-current`. Mobile strip keeps `no-scrollbar` scrolling.
- [ ] **Step 4: SeasonSelect.** `<form method="GET">` with a labelled `<select name="year">` (label "Season", visually hidden), submits on change, preserves other query params via hidden inputs excluding `year`; options from `seasonOptions(new Date(), 6)` as `seasonLabel`; adds "All seasons" option only when the pathname starts with `/sales` or `/accounting`.
- [ ] **Step 5: UserMenu.** `<details>` with summary showing initials, panel with the email text and the existing sign-out `<form method="POST" action="/logout">`; closes on Escape; focus ring from global rule.
- [ ] **Step 6: Load plumbing** per the files list; keep promises unawaited for streaming.
- [ ] **Step 7:** Gate plus e2e `auth` and `season-pass`. Manual: tab through header; selector on each of the five pages updates the URL and the Matches, Season, Dashboard, Accounting pages respond.
- [ ] **Step 8:** Stage; commit `feat(web): rebuild app shell with season selector and user menu`.

Acceptance: header shows only brand, nav, selector, avatar; sign-out reachable by keyboard; no theme control; `year` survives nav clicks; e2e green.

---

## S3: Dashboard

**Files:**
- Modify: `web/src/routes/(app)/dashboard/+page.svelte`, `+page.server.ts` (add amortization and recent-sales streams)
- Modify: `web/src/lib/ui/AskCard.svelte` (token pass only), `NetProfitSkeleton.svelte`
- Create: `web/src/lib/ui/RecentSales.svelte`

**Interfaces:**
- Consumes: `cancelledFrom`, `saleNet`, `MathBlock`, `BreakEvenBar`, `StatusChip` (S1); `year` handling (S2).
- Produces: `load` returns `{ accounting, amortization, sales, matches }` as unawaited promises.

- [ ] **Step 1:** Extend load: `amortization = api<Amortization>('/accounting/amortization/:year')`, `sales = api<SaleListItem[]>(year ? '/sales/season/:year' : '/sales/current-season')`.
- [ ] **Step 2:** Page: title "Dashboard"; `Button href="/sales/new"` labelled "Log sale". Net figure: Syne or display numeric class, `positive-strong`/`negative-strong`/`ink` by sign, with `signedMoney`. `MathBlock` lines: Realized proceeds (SOLD) +, Ticket invest −, Season pass −, result "Net realized profit". When there is no pass, the Season pass line reads "Not set" with link to `/season`.
- [ ] **Step 3:** Secondary row of three: Pending (warning, amount and ticket count), Cancelled (sunk, `cancelledFrom`), Gifted (gift, count only, no amount). Then `BreakEvenBar` from `amortization.progress` and `hasPass`.
- [ ] **Step 4:** `RecentSales`: five latest by `createdAt` desc: opponent and match date, tickets, `StatusChip`, listed price, net; CANCELLED rows show no profit; GIFTED rows show "Gifted to {Recipient.name}" and no price or profit.
- [ ] **Step 5:** Remove description list of pass fields, glossary, Upcoming matches (moves to Matches). Keep `AskCard`, placed after Recent sales, re-skinned (Q8). Keep error alerts and skeleton fallbacks for each `{#await}`.
- [ ] **Step 6:** Gate. Manual: seed with no pass, with pass and SOLD sales, with CANCELLED and GIFTED rows; confirm no "0,00 €" invest placeholder and no profit figure on cancelled rows.
- [ ] **Step 7:** Stage; commit `feat(web): rebuild dashboard to stitch design`.

Tests: no new pure logic (all in S1); e2e: add `e2e/tests/dashboard.e2e-spec.ts` asserting the h1 "Dashboard", button "Log sale", and net heading visible for the seeded user.
Acceptance: matches the brief's Dashboard paragraph; defects listed there absent; every figure traces to a MathBlock line; unauthenticated redirect unchanged.

---

## S4: Matches (master/inspector)

**Files:**
- Modify: `web/src/routes/(app)/matches/+page.server.ts` (also fetch season sales and season accounting; do not read `match`)
- Modify: `web/src/routes/(app)/matches/+page.svelte`
- Modify: `web/src/routes/(app)/matches/[matchId]/+page.svelte` (render the same inspector component full width)
- Create: `web/src/lib/ui/MatchInspector.svelte`, `MatchRow.svelte`, `MatchesSummary.svelte`
- Create: `web/src/lib/matches-view.ts`, `web/src/lib/matches-view.spec.ts`

**Interfaces:**
- Consumes: `sale.matchId` (S0), `groupSalesByMatch`, `summarizeSales`, `dominantStatus`, `saleNet`, `FilterTabs`, `StatusChip`, `MathBlock` (all S1).
- Produces: `matchSummary(sales: SaleListItem[]): { status: SaleStatus | null; tickets: number; net: number }`.

- [ ] **Step 1: Failing spec** `matches-view.spec.ts`: `matchSummary` "when a SOLD and a CANCELLED sale exist" status SOLD and net counts SOLD only; "when empty" status null and zeros.
- [ ] **Step 2:** Run `npx vitest run src/lib/matches-view.spec.ts`; expect FAIL; implement; expect PASS.
- [ ] **Step 3:** Load: add `sales = api<SaleListItem[]>('/sales/season/:year' or '/sales/current-season')` and `accounting`; return grouped maps as plain objects (Maps do not serialise; return `Record<string, SaleListItem[]>`).
- [ ] **Step 4:** Page: title "Matches", subtitle "Fixtures grouped by season. Sales attach to a match."; `MatchesSummary` strip (played x / total via `splitByKickoff`, tickets sold, pending, gifted via `summarizeSales`, net from accounting); competition `FilterTabs` (All plus the four competitions, `?competition=`); venue control kept (Q10).
- [ ] **Step 5:** `MatchRow`: date, opponent with home/away, competition chip, score when played (win/loss tone: win `positive`, loss `negative`, never carmine), sale summary (tickets, chip, net) or "No sale", left accent bar (`brand`-free: SOLD `positive`, PENDING `warning`, CANCELLED fill `#6e5d6d`, GIFTED `gift`, none `line`).
- [ ] **Step 6:** Selection from `page.url.searchParams.get('match')` read client side; at `lg` and up the row link sets `?match=` with `data-sveltekit-noscroll`; below `lg` the link goes to `/matches/{id}`. Inspector: details (date, competition, venue, score), sales attached (tickets, chip, listed price, invest, net; gifted rows "Gifted to {name}"), `MathBlock` "Proceeds − Ticket invest = Net" for SOLD rows, button "Log sale" linking `/sales/new?matchId={id}`. No seats, no stadium.
- [ ] **Step 7:** Past season (`isPastSeason`) keeps expanded list; upcoming first, played behind the existing disclosure; empty and filtered-empty messages preserved.
- [ ] **Step 8:** Gate. Verify in the browser network panel that changing `?match=` does not re-run the load; if it does, move the read into a client-only derived.
- [ ] **Step 9:** Add e2e smoke `matches.e2e-spec.ts`: seeded opponent row visible, clicking it shows the inspector heading and "Log sale" button.
- [ ] **Step 10:** Stage; commit `feat(web): rebuild matches as master list with inspector`.

Acceptance: brief Matches paragraph satisfied; per-match summary correct for a match with two sales of different statuses; keyboard operable list; mobile route still works.

---

## S5: Sales

**Files:**
- Modify: `web/src/routes/(app)/sales/+page.server.ts` (default current season, `all`, `year`; keep actions untouched)
- Modify: `web/src/routes/(app)/sales/+page.svelte` (toolbar, table, footer, restyle of panels by tokens only)
- Create: `web/src/lib/ui/SalesToolbar.svelte`, `SalesTotals.svelte`
- Create: `web/src/lib/sales-view.ts`, `web/src/lib/sales-view.spec.ts`
- Modify: `e2e/tests/sale.e2e-spec.ts` (add filter and totals assertions; existing steps unchanged)

**Interfaces:**
- Consumes: `parseSeasonParam` (S2), `summarizeSales`, `StatusChip`, `FilterTabs`.
- Produces: `filterByStatus(sales: SaleListItem[], status: SaleStatus | 'all'): SaleListItem[]`; `pendingFirst(sales: SaleListItem[]): SaleListItem[]` (stable, pending then the rest in input order); `parseStatusParam(url: URL): SaleStatus | 'all'`.

- [ ] **Step 1: Failing spec** `sales-view.spec.ts`: `filterByStatus` "when status is all" returns input; "when status is SOLD" only SOLD; `pendingFirst` "when mixed" pending first and relative order kept; `parseStatusParam` "when param is gifted (lower case)" returns `'GIFTED'`; "when invalid" returns `'all'`.
- [ ] **Step 2:** Run; expect FAIL; implement; expect PASS.
- [ ] **Step 3:** Load: `seasonYear = parseSeasonParam(url)`; `null` calls `/sales/current-season`; `'all'` calls `/sales/grouped` (flatten pending then terminal as today); a number calls `/sales/season/:year`. Return `year` as `SeasonYear | 'all' | null` and `canCreate` computed as `year === 'all' || year === null || year === currentSeasonStartYear`. Keep the redirect helpers; they must forward `year` verbatim.
- [ ] **Step 4:** Toolbar: title "Sales"; status `FilterTabs` (All, Pending, Sold, Cancelled, Gifted, `?status=`, client-side, load does not read it); buttons "Log sale" (primary, replaces "+ New sale") and "Import CSV" (secondary); the old inline season select is removed (header selector owns it). When `canCreate` is false keep the existing explanatory sentence.
- [ ] **Step 5:** Table columns in this DOM order: Match (opponent then date), Season (only when `year === 'all'`), Tickets, Status chip, Listed price, Invest, Profit (`saleNet`), actions (`Edit` link kept). Opponent column precedes price column (e2e regex). CANCELLED rows: no profit; GIFTED rows: "Gifted to {name}" in place of price and profit. Keep column sorting and aria-sort. Pending rows first via `pendingFirst`.
- [ ] **Step 6:** `SalesTotals` footer from `summarizeSales(filteredRows)`: tickets, proceeds (SOLD only), invest (SOLD), net, labelled "Net before season pass" (Q4).
- [ ] **Step 7:** Mobile cards restyled with the same chips. Edit drawer, new-sale panel, import modal: token-only restyle, no logic edits.
- [ ] **Step 8:** Gate plus full e2e. Extend `sale.e2e-spec.ts`: after creating a sale, click tab "Pending" and see the row, click "Sold" and not see it.
- [ ] **Step 9:** Stage; commit `feat(web): rebuild sales page with status tabs and totals`.

Acceptance: default view is current season; "All seasons" shows the season column; totals follow filters and exclude non-SOLD from proceeds; all pre-existing e2e steps pass untouched; no visual regression in edit drawer.

---

## S6: Accounting

**Files:**
- Modify: `web/src/routes/(app)/accounting/+page.server.ts`, `+page.svelte`
- Create: `web/src/lib/ui/MatchdayStrip.svelte`, `AmortisationBlock.svelte`, `SeasonMatchTable.svelte`
- Create: `web/src/lib/accounting-view.ts`, `web/src/lib/accounting-view.spec.ts`
- Modify: `web/src/lib/ui/AccountingCard.svelte`, `LeadTimeStrip.svelte` (token pass; demoted)
- Delete: `web/src/lib/ui/AmortizationCard.svelte`, `AmortizationCardSkeleton.svelte` (replaced), `AccountingCardSkeleton.svelte` only if unused after S3

**Interfaces:**
- Consumes: `sale.matchId` (S0), `dominantStatus`, `groupSalesByMatch` (S1, `$lib/sale-math.ts`), `summarizeSales`, `MathBlock`, `StatusChip`.
- Produces: `passCostPerMatch(passPrice: number, matchCount: number): number` (0 when `matchCount` is 0); `stripSegments(matches: FormattedMatch[], salesByMatch: Record<string, SaleListItem[]>, breakEvenMatchId: MatchId | null): { matchId: MatchId; opponent: string; date: string; status: SaleStatus | null; isBreakEven: boolean }[]`.

- [ ] **Step 1: Failing spec** `accounting-view.spec.ts`: `passCostPerMatch` "when 19 matches" divides; "when zero matches" returns 0; `stripSegments` "when a match has no sale" status null; "when the break-even match is given" only that segment flagged; "when SOLD and PENDING coexist" status SOLD; segment count equals match count.
- [ ] **Step 2:** Run; expect FAIL; implement; expect PASS.
- [ ] **Step 3:** Load: season from `parseSeasonParam` (null current, `all` all-time). Stream `accounting`; for a season also stream `amortization`, `matches` (`/matches/season/:year?withResult=true` or current-season), `sales`. `all` fetches only accounting.
- [ ] **Step 4:** Page: title "Season accounting". Four figures: Realized proceeds (SOLD), Pending, Season pass cost, Net realized profit (largest). `AmortisationBlock`: "Pass price ÷ matches in season = pass cost per match" using `matches.length` (Q3 default: all fixtures), with a "No season pass set" state linking to `/season`.
- [ ] **Step 5:** `MatchdayStrip`: one `<li>` per match, fill by status (SOLD `positive`, PENDING `warning`, CANCELLED `#6e5d6d`, GIFTED `gift`, none grey `line-strong`), break-even match marked with a visible marker and `aria-label`, legend with all five states, each segment has `aria-label` "{opponent}, {date}, {status or no sale}" so colour is never alone.
- [ ] **Step 6:** "How net profit is calculated": `MathBlock` Realized proceeds (SOLD) − Ticket invest − Season pass = Net realized profit. No tax, audit or compliance wording.
- [ ] **Step 7:** `SeasonMatchTable`: per-sale rows grouped under match (match, competition, tickets, invest, listed price, net, chip; gifted rows "Gifted to {name}", no price) and totals footer via `summarizeSales`. Season "all" hides amortisation, strip, table.
- [ ] **Step 8:** Under a "Details" disclosure keep `LeadTimeStrip` (shown when `soldCount >= 3`, as today) and `AccountingCard` Realized (Q8).
- [ ] **Step 9:** Gate. Add e2e smoke `accounting.e2e-spec.ts`: h1 "Season accounting", strip has one item per seeded match, table totals row visible.
- [ ] **Step 10:** Stage; commit `feat(web): rebuild accounting with matchday strip and match table`.

Acceptance: strip segment count equals fixtures; break-even marker matches `Amortization.breakEven`; figures equal Dashboard figures for the same season; legacy `?view=` links still resolve.

---

## S7: Season, auth, admin, landing restyle

**Files:**
- Modify: `web/src/routes/(app)/season/+page.svelte` (remove own season select; header selector owns `year`; `season/+page.server.ts` uses `parseSeasonYearParam` semantics already, verify `year=all` falls back to current)
- Modify: `web/src/routes/login/+page.svelte`, `register/+page.svelte` (drop `shadow-sm`, Syne heading, brand button; labels and button names unchanged)
- Modify: `web/src/routes/(app)/admin/matches/+page.svelte`, `web/src/routes/+page.svelte` (landing tokens)

- [ ] **Step 1:** Season page: replace remaining hard-coded classes with tokens, ensure the pass form uses `Button`, errors announced inline (`role="alert"` or `role="status"` as the e2e expects: `Pass added to season`).
- [ ] **Step 2:** Auth pages: card on `surface`, page on `surface-subtle`, headings Syne, error text `negative-strong`.
- [ ] **Step 3:** Admin and landing: map `hero-*` classes, remove any violet or carmine wash, keep content (Q14).
- [ ] **Step 4:** Gate plus full e2e (`auth`, `season-pass`, `sale`).
- [ ] **Step 5:** Stage; commit `feat(web): restyle season, auth and admin pages`.

Acceptance: no remaining references to removed tokens or `ThemeToggle`; `grep -rn "shadow-" web/src` is empty; e2e green; every page legible with focus rings.

---

## Self-review

- Spec coverage: tokens (S1), fonts (S1), dark-only and theme removal (S1, S2), shell and selector (S2), Dashboard (S3), Matches (S4), Sales including the default-season correction (S5), Accounting (S6), Season/auth/admin/landing (S7), D-API-1 (S0), testing strategy (per slice), open questions Q1 to Q14 (spec section 9; defaults used are the recommendations).
- Placeholder scan: none; every task names files and exact signatures. UI tasks list behaviours rather than markup by design (no implementation code in this stage).
- Type consistency (groupSalesByMatch is owned by S1, plain-object return): `saleNet`, `summarizeSales`, `dominantStatus`, `cancelledFrom`, `seasonOptions`, `parseSeasonParam`, `groupSalesByMatch` are defined once (S1, S2, S4) and consumed with the same names. 
- Dependency note: S4 and S6 both need S0 and `groupSalesByMatch` from S1.
