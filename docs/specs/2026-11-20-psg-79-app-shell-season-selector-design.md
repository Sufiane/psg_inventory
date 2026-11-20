# PSG-79 app shell, nav and global season selector: design

Status: draft for review. Slice S2 of `docs/specs/2026-11-19-stitch-redesign-design.md`
(decisions Q1, Q2, Q3, Q9 already taken there; not relitigated). Plan:
`docs/plans/2026-11-20-psg-79-app-shell-season-selector-plan.md`.

Scope: `web/` only. Branch `psg-79`, based on the PSG-78 tokens and fonts commit (S1 is in:
`seasonOptions`, `StatusChip`, `FilterTabs`, fonts and tokens exist). No backend change.

## 1. Goal

One header that carries the whole app: brand, five-item nav (plus Admin for admins), one global
season selector, one avatar menu. The selector writes `?year=` on the current path and replaces
the five per-page season controls. Loads read `year` consistently so the selector is never a no-op
or a lie.

Out of scope: page layouts (PSG-80 Dashboard, PSG-81 Matches, PSG-82 Sales, PSG-83 Accounting),
Season/auth/admin/landing restyle (S7), light theme (dropped, Q1).

## 2. Correction to the parent spec (important)

Parent spec section 6 (Sales) says `/sales/grouped` is "all seasons" and that the Sales default
is wrong. Verified false: `SalesService.getSalesGrouped` uses
`getSeasonWindow(seasonStartYearFromDate(new Date()))`, so it is the **current season**, pending
first. Today `?year` absent already means current season, and the "Current" option label is
correct. Consequences:

- There is no "default-season correction" to make on Sales. S5 (PSG-82) must drop that task.
- There is **no all-seasons sales endpoint** at all. `year=all` on Sales has no data source.
  Accounting does (`/accounting/all-time`).

## 3. URL contract

| URL | Meaning |
|---|---|
| `year` absent or invalid | current season, on every route |
| `year=2025` (exactly 4 digits) | that season start year |
| `year=all` | all seasons, **only** on `/sales` and `/accounting`; elsewhere coerced to current |

URL stays the only state (no cookie, no store). Parsing is one function, `parseSeasonParam`;
`/^\d{4}$/` strict (the old `parseInt` accepted `2025abc`).

### Where the selector shows

Pure `seasonScope(pathname)`:

| Path | Scope | Selector |
|---|---|---|
| `/dashboard`, `/matches`, `/season` | `season` | seasons only |
| `/sales`, `/accounting` | `season-or-all` | seasons plus "All seasons" |
| everything else (`/sales/new`, `/sales/:id`, `/matches/:id`, `/admin/*`) | `none` | hidden |

Hidden on detail, create and admin routes because `year` means nothing there (they read no
`year`). Decision D1.

### Nav links carry the season

`carrySeason(href, currentUrl)` appends `year=<n>` to a nav href when the current URL has a valid
year and the target scope is not `none`. `all` is carried only to `season-or-all` targets and
dropped otherwise (D2), so Dashboard from Sales(all) lands on a clean current-season URL.
Detail pages (scope `none`) lose the param; leaving them returns to current season. Known gap,
accepted: URL-only state (Q2). Not a bug to fix in this slice.

### Selector form

`<form method="GET">` on the current path (progressive: works before hydration, SvelteKit
intercepts it as a client navigation, `data-sveltekit-keepfocus`). Hidden inputs carry only a
whitelist of sibling params that survive a season change: `venue`, `competition`, `status`.
Everything else (`edit`, `new`, `matchId`, `match`) is dropped because it references data of the
previous season (D3). Whitelist rather than blacklist so a later slice cannot leak a stale id by
adding a param.

Options: `seasonOptions(now, 6)`; if the URL season is outside those six it is unioned in (Sales
does this today) so the control never shows a wrong value; "All seasons" only for
`season-or-all`. Displayed value is `resolveSeason(url, allowAll)`, so a coerced `all` on Matches
shows the current season.

## 4. Load plumbing (so the selector acts)

`resolveSeason(url, allowAll, now): SeasonYear | 'all'` is the single read path. Never returns
null.

| Route | Today | After |
|---|---|---|
| Dashboard | no year, current only | `year=n` and n not current: `/accounting/season/n`, `/matches/season/n?withResult=true`. Current/absent/all: unchanged endpoints |
| Matches | `parseSeasonYearParam` | unchanged (`all` already falls to current) |
| Season | `parseInt`, accepts 5-digit | `resolveSeason(url, false)` |
| Accounting | `view` + `year` | `year` absent: current; `all`: all-time; `n`: season n. Legacy `?view=all-time` still honoured when `year` is absent (D4). Returned `view`/`year` keep their shape so the page works untouched until PSG-83. Logic extracted to a pure `accounting-scope.ts` |
| Sales | absent: grouped (current). `n`: flat season list | absent or current: grouped (unchanged). `n` past: flat list. `all`: **fan-out** over `seasonOptions(now, 6)` with `/sales/season/:y`, flattened (D5). Adds `season: SeasonYear \| 'all'` to returned data; `year` keeps meaning "null for current/all" |

D5 is the one real design call (section 6, Q-A): the fan-out is six parallel GETs, bounded by the
selector's own list, frontend only. Past six seasons are not in "All seasons"; the label is
honest only while the selector offers six seasons. Alternatives in section 6.

## 5. Shell

- Brand link "PSG Inventory" (Syne via the existing base `font-display` rules; sentence case).
- Nav: Dashboard, Matches, Sales, Season, Accounting, Admin (ADMIN only, parent Q9). Active:
  `bg-surface-strong` plus `border-b-2 border-brand`; inactive `text-ink-muted`. `aria-label="Primary"`
  and `aria-current="page"` kept. Mobile: strip below the header row stays horizontally scrollable
  (`no-scrollbar`).
- Right side: `SeasonSelect` then `UserMenu`. Nothing else (no email, no sign out, no theme control).
- `UserMenu`: `<details>` (no JS dependency), summary shows initials from the email, panel shows
  the full email and the existing `POST /logout` form. Closes on Escape, on outside click and after
  navigation. `initialsFromEmail` is a pure helper.
- `ThemeToggle.svelte` deleted (its only consumer is the layout). `localStorage` theme script is
  already gone with S1.
- Container stays `max-w-6xl`. Matches master/inspector (PSG-81) may want wider; they own that
  change inside their route (Q-D).

### Per-page controls removed here

The ticket says the selector replaces them, and two controls fighting over `?year=` is worse than
a small deletion. Removed in this slice (Q-B):

- Matches: season `<select>` (the form keeps venue/competition; it gains a hidden `year` input so
  submitting a venue/competition change does not drop the season).
- Sales: season form and the `years` derived state.
- Season: season `<select>` and `years`.
- Accounting: Current / All time tabs and the season select, plus `years`. `currentYear =
  getFullYear()` and the `/season?year={getFullYear()}` link are calendar-year bugs; the link
  becomes `seasonStartYearFromDate`.

These pages are rewritten by PSG-80..83 later; S2 merges first, so no conflict, and it leaves each
page working.

## 6. Open design questions

- **Q-A (needs user): "All seasons" on Sales has no endpoint.** (a) frontend fan-out over six
  seasons, default of this plan, ~35 lines, label caveat above; (b) new backend
  `GET /sales/all` (a new feature and a separate backend ticket; sorts out the season column
  data for PSG-82 too; cleaner but blocks); (c) offer "All seasons" on Accounting only and drop it
  from Sales (contradicts ticket text and Q2). Recommendation: (a) now, revisit (b) only if six
  seasons proves too few or the calls feel slow.
- **Q-B: remove per-page controls in S2** (default) vs leave to PSG-80..83. Default chosen above.
  If leaving, Matches/Sales/Season/Accounting show two competing controls until each slice lands.
- **Q-C: keep legacy `?view=all-time`** (default, ~5 lines) vs drop.
- **Q-D: container width.** Keep `max-w-6xl`; PSG-81 widens locally if the inspector needs it.
- D1 selector hidden on `none` routes, D2 `all` dropped when navigating to unsupported routes, D3
  whitelist of retained params: judgement calls, reversible, no user input needed.

## 7. What the shell exposes to PSG-80..83

All in `$lib/season.ts` unless noted, covered by vitest:

- `resolveSeason(url, allowAll)`: every page load reads the season through it.
- `carrySeason(href, url)`: in-page links (Dashboard "Log sale", Matches `?match=` rows, Sales
  `FilterTabs` hrefs, Accounting links) wrap their href so the season survives.
- `retainedParams` whitelist: a slice that adds a new filter param (`status`, `competition`,
  `venue` exist) adds it here.
- `seasonScope` table: PSG-80..83 add no new routes with a season; a new one adds a row.
- Sales load returns `season: SeasonYear | 'all'` (PSG-82 shows the Season column when `'all'`).
- Accounting load returns `view`/`year` unchanged and can add `season`; PSG-83 may simplify.
- Header height and the `main` container are stable; pages render their own `h1` and subtitle.

## 8. Testing

- Vitest (node env, pure modules): `parseSeasonParam`, `resolveSeason`, `seasonScope`,
  `carrySeason`, `retainedParams`, `seasonChoices`, `initialsFromEmail`, `resolveAccountingScope`.
  Describe per condition, `it` states outcome only.
- No component harness exists (parent F2); `SeasonSelect` and `UserMenu` are covered by manual
  keyboard pass and e2e `auth`, `sale`, `season-pass` staying green.
- Gate in `web/`: `npm run check && npm run typecheck && npm test && npm run build && test -f
  .svelte-kit/cloudflare/_worker.js`.
