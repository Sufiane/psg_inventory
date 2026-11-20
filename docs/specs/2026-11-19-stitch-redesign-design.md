# Stitch redesign (Midnight Carmine Terminal) — design

Status: draft for user review. Source of decisions: `.context/stitch/design-brief.md`
(decided with the user on 2026-11-19; not relitigated here). Plan:
`docs/plans/2026-11-19-stitch-redesign-plan.md`.

Scope: `web/` (SvelteKit 2, Svelte 5, Tailwind 4, Cloudflare adapter). Backend is out of
scope except one additive, flagged change (D-API-1).

## 1. Goal and approach

Re-skin the whole web app to the Stitch design system and rebuild the five main pages
(Dashboard, Matches, Sales, Season accounting) to the brief's layouts, while keeping every
existing capability that the brief does not explicitly remove.

Approach: **token-first, names stable.** The Tailwind `@theme` token names
(`ink`, `surface`, `line`, `primary`, `positive`, `negative`, `warning`, `sunk`, `gift`,
`hero-*`) are kept; only their values change. 9 files use `bg-primary`, 15 use
`text-primary`, 43 lines use `rounded-lg`; a rename would churn all of them for no gain.
Markup changes are then limited to the places where the brief changes layout or semantics.

Rejected alternatives:
- Rename tokens to Stitch names (`on-surface`, `surface-container-*`): large mechanical diff,
  no behavioural gain, breaks every parallel slice with merge conflicts.
- Page-by-page restyle without tokens first: each slice would re-decide colours.

## 2. Theme: dark only (recommendation, open question Q1)

Stitch ships dark only. The app has light (default), dark, system, and a toggle.

Recommendation: **drop light and the toggle.** Reasons: (a) no light design exists, so a
light set would be invented; (b) the carmine brand fails AA as text on both modes' surfaces
unless split into a fill token and a text token (section 3), doubling the verification;
(c) the brief's chip and strip colours were chosen against navy. Cost of keeping light: one
more token set (~35 lines in `app.css`), a light carmine/emerald/amber palette to design and
contrast-check, and every slice re-verified twice. If the user keeps light, S1 adds that
set and the toggle stays; nothing else in the plan changes.

If dark-only: delete `ThemeToggle.svelte`, the inline `localStorage` script in `app.html`,
both override blocks in `app.css`, set `color-scheme: dark` on `:root`, change
`<meta name="theme-color">` from `#004170` to `#070e1c`, and check `web/static/manifest.webmanifest`
and `scripts/generate-icons.mjs` for the old blue.

## 3. Token mapping

Single value set (dark). Contrast figures were computed (WCAG relative luminance) against
`surface` `#0c1321` and `surface-strong` `#19202e`; "n/a" = fill or non-text use.

### Neutrals and ink

| Token | Value | Stitch source | Contrast (surface / surface-strong) |
|---|---|---|---|
| `surface-subtle` | `#070e1c` | container-lowest | page background, table headers |
| `surface` | `#0c1321` | surface / background | cards, header, inputs |
| `surface-strong` | `#19202e` | container | hover, selected row, active tab, inspector |
| `ink` | `#dce2f7` | on-surface | 14.4 / 12.6 |
| `ink-muted` | `#a3acc2` | derived | 8.2 / 7.2 |
| `ink-faint` | `#8b94aa` | derived | 6.1 / 5.4 |
| `line` | `#232a39` | container-high | decorative separators only (1.3:1) |
| `line-strong` | `#6a7490` | derived | 4.0 / 3.5 (control borders need 3:1) |

Notes:
- Stitch `on-surface-variant` is `#e7bcbc` (pink). Using it as the muted text colour would
  tint every label pink, against "Quiet". `ink-muted` and `ink-faint` are blue-grey
  derivations on the navy hue. Judgement call, open question Q5.
- `#151b2a` (container-low) is intentionally unused: `surface-strong` is the only raised step.
  Adding a fourth surface later is cheaper than removing one.
- `ink-faint` must not be placed on `#232a39` or lighter (4.7 and falling).

### Brand (the one token split)

`#e1003c` is 3.77:1 on `surface`: it passes for fills and 3:1 non-text (underline, strip
segment) but **fails 4.5:1 as text**. Today `--color-primary` serves both roles
(`text-primary` links, `bg-primary` buttons), so it must split:

| Token | Value | Role | Contrast |
|---|---|---|---|
| `primary` | `#ffb3b4` | links, focus ring, text accents | 10.9 on surface |
| `primary-hover` | `#ffdad9` | link hover | higher than `primary` |
| `brand` (new) | `#e1003c` | button fill, active-nav underline, selected accent bar | 3.77 non-text |
| `brand-hover` (new) | `#bf0031` | button hover | white on it 6.4 |
| `on-brand` (new) | `#ffffff` | text on `brand` | 4.92 on `#e1003c` |

Consequence: `Button.svelte` and the 8 other places using `bg-primary text-surface` move to
`bg-brand text-on-brand hover:bg-brand-hover`. `text-primary` usages (links) keep working
and become pink-tinted, which is the Stitch primary.

### Semantic status tones

| Token | Value | Meaning | Contrast on surface |
|---|---|---|---|
| `positive` | `#10b981` | SOLD, profit | 7.3 |
| `positive-strong` | `#4edea3` | large net figure | higher |
| `negative` | `#ffb4ab` | negative profit only (never carmine) | 10.9 |
| `negative-strong` | `#ffdad6` | negative figure emphasis, error text | higher |
| `warning` | `#f59e0b` | PENDING | 8.7 |
| `warning-strong` | `#fbbf24` | pending emphasis | higher |
| `sunk` | `#9d7d91` | CANCELLED text on `surface` / `surface-subtle` | 5.1 |
| `sunk-strong` | `#b08fa4` | CANCELLED text on `surface-strong` (plum `#9d7d91` is 4.49 there, fails) | 5.7 |
| (fill) | `#6e5d6d` | cancelled accent bar and strip segment, non-text | 3.05 |
| `gift` | `#2aa7b8` | GIFTED | 6.5 |
| `gift-strong` | `#5cc4d2` | gift emphasis | higher |

`-strong` values other than the Stitch-given ones are lighter steps chosen by this plan;
S1 must re-measure them (task listed) before merge.

### Hero tokens

`hero-bg`, `hero-bg-deep`, `hero-ink`, `hero-ink-muted` exist only for the logged-out landing
page (`web/src/routes/+page.svelte`, 28 lines). Map to `#0c1321`, `#070e1c`, `ink`,
`ink-muted`. No violet or carmine wash: carmine is brand fill only.

### Radius, shadow, fonts

- Radius: override `--radius-lg` to `0.375rem` and `--radius-md` to `0.25rem` in `@theme`
  so the 43 `rounded-lg` usages tighten without markup churn (open question Q6).
- Shadow: remove the 5 `shadow-*` usages (brief bans glow shadows).
- `--font-sans`: Space Grotesk Variable then system fallbacks. `--font-display`: Syne Variable.
  Base layer: `h1, h2, h3 { font-family: var(--font-display); letter-spacing: -0.02em }`.
- `--font-mono` is **redefined to the Space Grotesk stack**, so existing `font-mono` on
  amounts (grep: used on every figure) renders tabular Space Grotesk with no markup change.
  The existing `.font-mono, [data-numeric]` rule already forces `tnum`. S1 must verify
  Space Grotesk's `tnum` renders aligned columns; if not, fall back to Space Grotesk plus
  `font-variant-numeric: tabular-nums` on a mono fallback (open question Q7).

### Fonts (Cloudflare-safe, no CDN)

Packages: `@fontsource-variable/syne` 5.3.0 and `@fontsource-variable/space-grotesk` 5.3.0
(OFL-1.1, ~79 kB and ~67 kB unpacked), pinned exactly, no caret. Imported from JS in
`web/src/routes/+layout.svelte` (`import '@fontsource-variable/syne'`), **not** via CSS
`@import` (user rule: PostCSS `@import` is unreliable in CF Pages builds). Vite hashes the
woff2 files into `_app/immutable/assets/`, which the Workers `assets` binding serves with
immutable caching; `static/sw.js` already cache-firsts `/_app/immutable/`. `unicode-range`
subsets mean French text pulls only latin and latin-ext. Result: zero third-party requests.
Weights used: Syne 600 to 800, Space Grotesk 400 to 700, both inside the variable axes.

## 4. Shell and navigation

Current: `+layout.svelte` header with brand, nav (5 items plus admin), ThemeToggle, email,
sign-out; active item `bg-surface-strong/60`.

Target (brief decision 3):
- Brand "PSG Inventory" (sentence case, Syne).
- Nav: Dashboard, Matches, Sales, Season, Accounting (+ Admin for ADMIN, kept; not in the
  brief, so it is an addition the brief did not cover, see Q9). Active: `surface-strong`
  highlight plus a 2px `brand` bottom border; inactive `ink-muted`.
- Right side: **season selector + avatar only.** Email and "Sign out" move into an avatar
  menu (`<details>` popover, keyboard accessible, no JS dependency), initials from the email.
- Mobile: nav strip stays horizontally scrollable (existing `no-scrollbar` pattern).

### Global season selector (design decision, Q2)

Today every page has its own season control with different param conventions:
Matches and Sales use `?year=` (Sales default silently means "all seasons", see section 6),
Accounting uses `?view=current|all-time|season&year=`, Season uses `?year=`, Dashboard has none.
Also `years = currentYear - i` uses the **calendar** year, so from January to July it offers
a future season start year. A shared helper `seasonOptions(now, count)` built on
`seasonStartYearFromDate` replaces this.

Design: one selector in the header writes `?year=<seasonStart>` (or `?year=all`) on the
**current path**; nav links carry the current `year` across pages. `year` absent means the
current season everywhere (including Sales and Accounting). `all` is offered only on routes
that support it: Sales and Accounting. Matches, Season and Dashboard coerce `all` to current.
URL stays the source of truth (no cookie, no store), matching how the pages already work.

Load-only changes S2 must make so the selector is not a no-op: Dashboard accepts `year`
(`/accounting/season/:year`, `/sales/season/:year`, `/accounting/amortization/:year`
already exist) and Accounting treats `year` as the season view.

## 5. Shared components (new)

| Component | Purpose | Used by |
|---|---|---|
| `StatusChip.svelte` | one chip per status; text label always present (DOM text stays the enum literal so e2e `toContainText('PENDING')` keeps passing) | all pages |
| `SeasonSelect.svelte` | header selector | shell |
| `UserMenu.svelte` | avatar menu | shell |
| `FilterTabs.svelte` | link-based tabs with `aria-current` | Matches (competition), Sales (status) |
| `MathBlock.svelte` | "a − b − c = net" lines, signed, tabular | Dashboard, Matches inspector, Accounting |
| `BreakEvenBar.svelte` | % of pass recovered | Dashboard, Accounting |
| `MatchdayStrip.svelte` | one segment per match, legend | Accounting |

New pure modules (vitest-covered): `$lib/sale-math.ts` (`saleNet`, `summarizeSales`,
`dominantStatus`, `groupSalesByMatch`, `cancelledFrom(unrealized, gifted)`), `$lib/season.ts`
gains `seasonOptions`. Existing `sale-helpers.ts` (`statusPill`, `profitTone`) keeps its
names; only the class strings change if needed (tokens flip the colours already).

Retired: `ThemeToggle.svelte` (if dark-only), `NetProfitSkeleton`/`AmortizationCard*`
replaced by the new blocks. Kept and only re-skinned: `Button`, `Skeleton`, `Spinner`,
`ToastHost`, `ImportSalesModal`, `ImportSalesDraft`, `AskCard`, `LeadTimeStrip`,
`AccountingCard` (demoted, see Accounting).

Per-sale arithmetic (important, verified in code): the API's `sale.profit` is
`listedPrice * (100 - PSG_COMMISSION) / 100` (`src/api/sales/shared/profit.util.ts`,
commission 12). It is **proceeds**, not net of ticket invest. The Dashboard already computes
`net = Σ profit(SOLD) − Σ invest(SOLD) − seasonPass`. The brief's per-row "profit" and the
Matches math "proceeds − invest = profit" therefore mean `saleNet = sale.profit − sale.invest`,
computed in one helper. Today's Sales table shows `sale.profit` under the header "Profit";
the redesign changes that column's meaning (Q4).

## 6. Per-page gap analysis

Verified against `web/src/routes/(app)/*` and the Nest controllers.

### Dashboard (`dashboard/+page.svelte`, 271 lines; `+page.server.ts`)

Current: title "Current season"; Ask card first; net card with math (already
proceeds, invest, season investment); a pass description list; collapsible glossary;
Unrealized and Pending cards; "Upcoming matches" list; button "New sale".

Differs from brief:
- Title must be "Dashboard"; primary button "Log sale" (no plus). Link target `/sales/new` is fine.
- Net figure must dominate (Syne/numeric ticker 56px class), math lines "Realized proceeds (SOLD) − Ticket invest − Season pass = Net".
- Secondary row: Pending (amber), Cancelled (plum, sunk), Gifted count (teal). Today it shows
  "Unrealized" with gifted as a footnote.
- New: break-even bar, recent sales list. Removed: season description line (category, row, seat),
  glossary, "Upcoming matches" (moves to Matches).
- Ask card: not in brief, see Q8.

Data:
- Cancelled amount = `unrealized.totalProfit − gifted.totalProfit` (types.ts documents gifted as a
  **subset** of unrealized). Count likewise via `totalSales`. Derived in `sale-math.ts`.
- Gifted count: `accounting.gifted.totalSales`. Supported.
- Break-even bar: `Amortization.progress` (0..1) via `/accounting/amortization/:year`, already
  consumed by Accounting; Dashboard adds one streamed call. `hasPass=false` must render "No season
  pass set" with a link to `/season`, not 0 % (PRODUCT.md principle 5).
- Recent sales: `/sales/current-season` or `/sales/season/:year` returns `SaleListItem[]` with
  opponent, `matchDate`, tickets, status, listed price, invest, profit, `Gift.Recipient.name`.
  Sort by `createdAt` desc and take 5 client/server side. Supported. No new endpoint.
- Defect not to copy: "Ticket invest 0,00 €" placeholder (use the real `realized.totalInvest`),
  profit on cancelled rows (CANCELLED rows show no profit, tone `sunk`), "Export CSV".

### Matches (`matches/+page.svelte`, 172 lines; `[matchId]/+page.svelte`, 160)

Current: flat list (upcoming, past in a `<details>`), filters Season select, venue segmented,
competition select; each row links to a separate `/matches/[matchId]` page.

Differs from brief: master-list plus right inspector; summary strip; competition tabs; accent
bar per row by status; per-match sales summary and profit; "Log sale" in inspector; subtitle
"Fixtures grouped by season. Sales attach to a match."

Data:
- Summary strip "matches played 12 / N": from the match list with `splitByKickoff`. Supported.
  Tickets sold/pending/gifted and net profit: from the season sales list and
  `/accounting/season/:year`. Supported.
- Competition tabs: `FormattedMatch.competition` is a string, `COMPETITIONS` has the four values
  the brief lists. Supported (server-side filter already exists via `?competition=`).
- Venue filter (Both/Home/Away) is not in the brief; kept as a small secondary control (Q10).
- **Per-match sales summary: NOT supported without a change.** `FormattedSale` omits `matchId`
  (`sales.service.ts` `formatSale` omits `['Match','userId','matchId']`; `SaleListItem` and
  `MatchSale` have no id). The sales list cannot be joined to matches by id. Options:
  (a) one `/sales/match/:id` call per row: N+1, no; (b) join on `matchDate` plus opponent name:
  works today but fragile (string equality of two serialisations); (c) **recommended D-API-1:**
  stop omitting `matchId` from `FormattedSale` (one-line backend change, additive, two
  response endpoints widen, plus web types). Slices S4 and S6 depend on it. If the user rejects
  (c), S4 and S6 use (b) behind a single `matchKey()` helper.
- Pass cost per match: not needed on Matches page.
- Inspector sales: filter the already-loaded season sales by `matchId` (needs D-API-1);
  gifted rows show `Gift.Recipient.name`. Competition, venue, score from `FormattedMatch`.
- Selection: `?match=<id>` read client-side from `$app/state` so the load function does not
  re-run (the load must not read that param). Below `lg`, rows link to the existing
  `/matches/[matchId]` route, which becomes the same inspector component full-width. No
  seats or stadium details anywhere (the model has none for matches).

### Sales (`sales/+page.svelte`, **1 228 lines**; `+page.server.ts`)

Current: title, season select (`Current` option), Import CSV, "+ New sale"; one table with
sortable columns, pending first when grouped; edit drawer and new-sale panel inline; mobile cards.

Differs: two filters (season dropdown + status tabs), "Log sale" / "Import CSV" labels, season
column, totals footer, Syne title, chip style, gifted-row presentation.

Data findings (important):
- **Season filter exists but its default is wrong for the brief.** `year === null` calls
  `/sales/grouped`, which is **all seasons**; the "Current" option label is therefore misleading
  today. The brief wants default current season plus an explicit "All seasons". New contract:
  absent `year` means current season (`GET /sales/current-season`, exists), `year=all` means
  `/sales/grouped`, `year=2024` means `/sales/season/2024`. `canCreate` logic is unchanged
  (current or `all`). Redirects after actions already forward `?year=`. Risk: the e2e `createSale`
  helper lands on `/sales` and expects the new row; the seeded match is current season by
  construction (picker only offers current-season matches), so this still holds; S5 verifies.
- Status tabs: client-side filter on `?status=`; `load` must not read it.
- Season column "visible when All seasons": `seasonLabelFromDate(sale.matchDate)`. Supported.
- Totals footer: tickets, proceeds (SOLD only), invest, net. "Invest" scope and whether net
  excludes the pass: Q4. Computed client-side from the filtered rows (`summarizeSales`).
- Pending first: grouped mode already provides it; season mode needs the same stable sort.
- The edit drawer and new-sale panel contain logic and are covered by e2e. S5 restyles by
  tokens only and does **not** extract or refactor them. E2E constraints to preserve:
  row accessible name `/<opponent>.*<price>/` (opponent column before price column), an
  `Edit` link per row, region names of the drawer, button names `Create sale`, `Mark sold`,
  `Mark gifted`, `Delete sale`, labels `Match` and `Listed price (€)`.

### Accounting (`accounting/+page.svelte`, 221; `AccountingCard`, `AmortizationCard`)

Current: tab bar Current | All time | season select; net card; amortisation card; lead-time
strip; Realized card (best/worst/averages); Unrealized and Pending cards.

Differs: "Season accounting" title, season switcher, four headline figures, amortisation block,
19-segment matchday strip, "How net profit is calculated", match-by-match table with totals.

Data:
- Four figures: `realized.totalProfit`, `pending.totalProfit`, `totalSeasonInvestment`, net. Supported.
- Pass cost per match = `passPrice / matchCount`. `passPrice` from `Amortization`; **`matchCount`
  is not in any accounting response.** Take `matches.length` from `/matches/season/:year`
  (new fetch in this load). Divisor ambiguity (all fixtures vs home fixtures) is Q3.
- Matchday strip: `Amortization.perMatch` contains **only matches with a SOLD sale**
  (`getRealizedProfitPerMatch` filters `status: SOLD`), so it cannot drive 19 segments. Use the
  full match list plus per-match status from the season sales list (D-API-1). Break-even match:
  `Amortization.breakEven.matchId`, supported. A match with several sales takes one segment
  colour by precedence SOLD, PENDING, GIFTED, CANCELLED, none (Q11).
- Match-by-match table: competition from the matches list, other columns from sales. A match can
  hold several sales with different statuses, so rows are **per sale, grouped under the match**
  (Q11), with a totals footer from `summarizeSales`.
- All-time view: brief specifies a season switcher only. Keep "All seasons" showing the four
  figures and the waterfall (data exists at `/accounting/all-time`); hide amortisation, strip and
  table (no cross-season per-match data). Q12.
- `AccountingCard` (best/worst sale, averages) and `LeadTimeStrip` are real features absent
  from the brief: keep them, re-skinned, under a "Details" disclosure at the bottom (Q8).
- No tax, audit or compliance language anywhere; commission is not named in the UI today and stays
  unnamed (Q13).

### Season (`season/+page.svelte`, 327), auth, admin, landing

No Stitch design; inherit tokens and shell.
- Season: tokens only; copy to sentence case ("Season passes" already is). Its own season
  control (`?year=`) is replaced by the header selector. Row and seat fields are the data-entry
  form for the pass and stay.
- Login/register: tokens, Syne heading, `brand` button, drop `shadow-sm`. Preserve labels
  `Email`, `Password` and the `Sign in` button (e2e).
- Admin matches: tokens only.
- Landing (`/`): unauthenticated hero with demo accounts and a tour list, uses `hero-*` tokens
  and `bg-primary`. Re-token only, keep content (Q14).

## 7. Non-goals

Backend behaviour changes other than D-API-1; CSV export; light theme (unless Q1 says
otherwise); new copy features; component-level browser tests (no jsdom/Playwright component
setup exists; see testing); marketing pages; icons regeneration beyond colour check.

## 8. Testing strategy

- Vitest (`web/`, node env, `src/**/*.spec.ts`): pure modules only: `sale-math`, `season`
  (`seasonOptions`, existing param parsing), `matches`, `sale-helpers`, and any new
  `+page.server.ts` helper extracted to a `.ts` file (the repo's `read-payload.ts` pattern).
  Describe blocks per condition ("when ..."), `it` titles state outcome only.
- Playwright e2e (`e2e/tests`): existing `auth`, `sale`, `season-pass` must stay green; S5
  adds assertions for the status tab filter and totals footer; S4/S6 each add one smoke test
  (page renders seeded match, inspector shows its sale).
- Per slice gate: `npm run check`, `npm run typecheck`, `npm test`, `npm run build` in `web/`
  **and** assert `test -f .svelte-kit/cloudflare/_worker.js` (build exit 0 is not evidence).
- Manual: contrast spot-check of every new colour pair; `prefers-reduced-motion` on any
  new transition; keyboard pass on header, tabs, avatar menu.

## 9. Open questions (judgement calls)

Decided by the user on 2026-11-19:

- Q1 DECIDED: drop the light theme and the toggle for now (dark only).
- Q2 DECIDED: one global season selector writing `?year=` on the current path, `all` only on
  Sales and Accounting; replaces the five per-page season controls.
- Q3 DECIDED: pass cost per match divides by all fixtures in the season (away games can be
  sold too).
- Q8, Q9, Q10, Q14 DECIDED: keep the non-design features, restyled, as proposed.
- D-API-1 DECIDED: approved, expose `matchId` on `FormattedSale`.

Not yet explicitly confirmed (proceeding with the stated default; user can overrule):
Q4 (per-row profit = proceeds − invest, footer SOLD-only), Q5, Q6, Q7, Q11, Q12, Q13.

Original wording of the decided questions, kept for context:

Q1. Light theme: recommend drop (dark only).
Q2. Global season selector (see above).
Q3. Pass cost per match divisor: all fixtures vs home fixtures only.
Q4. Per-row "Profit" becomes `proceeds − invest` (today it is `sale.profit`, proceeds).
    Sales footer "invest" and "net": recommend SOLD rows only, net labelled "Net before season pass".
Q5. Muted text colours are derived blue-greys, not Stitch's pink `on-surface-variant`.
Q6. Tighter radii via theme override.
Q7. Space Grotesk tabular figures replace the system mono for all amounts; verify visually.
Q8. Keep Ask card, lead-time strip, and the Realized best/worst card (not in brief, not invented
    by Stitch). Recommend keep, demoted below the new blocks.
Q9. Admin nav item retained for admins.
Q10. Venue filter retained on Matches as a small secondary control.
Q11. Per-match status precedence for the strip, and per-sale rows in the accounting table.
Q12. "All seasons" accounting view reduced to figures plus waterfall.
Q13. 12 % commission is invisible in the UI; proceeds are net of it silently. Add a one-line
    explanation or leave (brief removes "club fees" from the mock, which is a different thing).
Q14. Landing page and demo accounts kept, re-tokened only.
D-API-1 (approval needed): expose `matchId` on `FormattedSale`.
