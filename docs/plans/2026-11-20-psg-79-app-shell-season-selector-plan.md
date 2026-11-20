# PSG-79 app shell and global season selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Builder: `frontend-builder` only.

**Goal:** One header (brand, nav, global season selector, avatar menu) writing `?year=`, with every season-aware load reading it through one helper, replacing the per-page season controls.

**Architecture:** Pure helpers in `$lib/season.ts` (parse, resolve, scope, carry) drive both the shell components and the loads, so URL logic is vitest-covered and components stay thin. Loads change only where the selector would otherwise be a no-op.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Tailwind 4, Vitest (node env, `src/**/*.spec.ts`). No backend change.

**Spec:** `docs/specs/2026-11-20-psg-79-app-shell-season-selector-design.md` (read section 2: the parent spec is wrong about `/sales/grouped`). Parent: `docs/plans/2026-11-19-stitch-redesign-plan.md` slice S2.

## Global constraints

Parent plan "Global Constraints" apply verbatim (pinned deps, no barrels, explicit return types, no single-letter names, no inline `if`, blank line before `if/for/return/throw`, no `!!`, numeric separators, no comments unless a non-obvious why, sentence-case copy, conventional commits scope `web`, no PR numbers, stage and stop for `/crit`). Tests: a `describe` per condition ("when ..."), `it` states only the outcome. No new dependencies.

Branch is `psg-79` (already correct). Linear: move PSG-79 to In Progress before starting, In Review only when staged.

## Size and ticket split

Estimate (added plus removed lines, tests included): about **650**, under the 800 cap, one PR, frontend only, one actor (authenticated), one layer (web).

| Task group | Lines |
|---|---|
| Helpers and specs (`season.ts`, `user.ts`, `accounting-scope.ts`) | ~280 |
| Load changes (dashboard, season, accounting, sales) | ~110 |
| Per-page control removal (matches, sales, season, accounting) | ~130 (mostly deletions) |
| Shell (`SeasonSelect`, `UserMenu`, `+layout.svelte`, delete `ThemeToggle`) | ~130 |

Fallback if the builder lands above 800: split into **S2a** (helpers, shell, Dashboard/Season loads, ~400) and **S2b** (Accounting and Sales loads plus per-page control removal, ~300, depends on S2a). Do not pre-split.

Follow-up tickets (not folded in): (1) PSG-82 drops the "default-season correction" task (spec section 2); (2) optional backend `GET /sales/all` only if the fan-out proves insufficient (new feature, separate backend ticket); (3) detail pages (`/matches/:id`, `/sales/:id`) do not preserve `year` (known gap, URL-only state).

## File map

- Modify `web/src/lib/season.ts`, `web/src/lib/season.spec.ts`
- Create `web/src/lib/user.ts`, `web/src/lib/user.spec.ts`
- Create `web/src/routes/(app)/accounting/accounting-scope.ts`, `accounting-scope.spec.ts`
- Modify `web/src/routes/(app)/dashboard/+page.server.ts`
- Modify `web/src/routes/(app)/season/+page.server.ts`, `+page.svelte`
- Modify `web/src/routes/(app)/accounting/+page.server.ts`, `+page.svelte`
- Modify `web/src/routes/(app)/sales/+page.server.ts`, `+page.svelte`
- Modify `web/src/routes/(app)/matches/+page.svelte`
- Create `web/src/lib/ui/SeasonSelect.svelte`, `web/src/lib/ui/UserMenu.svelte`
- Modify `web/src/routes/+layout.svelte`
- Delete `web/src/lib/ui/ThemeToggle.svelte`

---

## Task 1: season helpers (TDD)

**Interfaces (exact):**
```ts
export type SeasonScope = 'none' | 'season' | 'season-or-all';
export function parseSeasonParam(url: URL): SeasonYear | 'all' | null;
export function resolveSeason(url: URL, allowAll: boolean, now?: Date): SeasonYear | 'all';
export function seasonScope(pathname: string): SeasonScope;
export function carrySeason(href: string, from: URL): string;
export function retainedParams(url: URL): [string, string][];
export function seasonChoices(now: Date, count: number, selected: SeasonYear | null): { year: SeasonYear; label: string }[];
```
`parseSeasonYearParam` stays exported and delegates (`'all'` gives `null`).

- [ ] **Step 1: Write failing specs** appended to `season.spec.ts` (import the new names). Cases, each as nested describes:
  - `parseSeasonParam`: "when year is 2025" gives 2025; "when year is all" gives `'all'`; "when year is 0", "abc", "2025abc", "12345", "" and absent each give `null`.
  - `resolveSeason` with `now = 2026-11-20`: "when year is absent" gives 2026; "when year is 2024" gives 2024; "when year is all and all is allowed" gives `'all'`; "when year is all and all is not allowed" gives 2026; "when now is March 2027 and year is absent" gives 2026.
  - `seasonScope`: `/dashboard`, `/matches`, `/season` give `'season'`; `/sales`, `/accounting` and `/sales/` give `'season-or-all'`; `/sales/new`, `/sales/abc`, `/matches/abc`, `/admin/matches`, `/` give `'none'`.
  - `carrySeason` with `from = https://x/sales?year=2025`: `/matches` gives `/matches?year=2025`; `/admin/matches` unchanged; `/sales?status=SOLD` gives `/sales?status=SOLD&year=2025`. With `from = ...?year=all`: `/accounting` gives `/accounting?year=all`; `/dashboard` unchanged. With no year: href unchanged.
  - `retainedParams` on `?year=2025&venue=home&edit=abc&status=SOLD&competition=Ligue%201`: returns venue, status, competition pairs only (order of the whitelist), never `year` or `edit`.
  - `seasonChoices(now 2026-11-20, 3, selected)`: "when selected is inside the list" returns three; "when selected is 2018" returns four with 2018 last; "when selected is null" returns three.
- [ ] **Step 2:** `cd web && npx vitest run src/lib/season.spec.ts`. Expect FAIL (exports missing).
- [ ] **Step 3: Implement** in `season.ts`:
```ts
const SEASON_PARAM = /^\d{4}$/;
const RETAINED_PARAMS = ['venue', 'competition', 'status'] as const;
const SEASON_ONLY_PATHS = new Set(['/dashboard', '/matches', '/season']);
const SEASON_OR_ALL_PATHS = new Set(['/sales', '/accounting']);

export function parseSeasonParam(url: URL): SeasonYear | 'all' | null {
    const raw = url.searchParams.get('year');

    if (raw === 'all') {
        return 'all';
    }

    if (raw !== null && SEASON_PARAM.test(raw)) {
        return Number.parseInt(raw, 10) as SeasonYear;
    }

    return null;
}

export function parseSeasonYearParam(url: URL): SeasonYear | null {
    const parsed = parseSeasonParam(url);

    return parsed === 'all' ? null : parsed;
}

export function resolveSeason(url: URL, allowAll: boolean, now: Date = new Date()): SeasonYear | 'all' {
    const parsed = parseSeasonParam(url);

    if (parsed === 'all' && allowAll) {
        return 'all';
    }

    return parsed === null || parsed === 'all' ? seasonStartYearFromDate(now) : parsed;
}
```
  `seasonScope` trims one trailing slash then checks the two sets; `carrySeason` splits `href` at `?` for the path, returns `href` unchanged when the parsed year is `null`, scope is `none`, or year is `'all'` and scope is not `season-or-all`, else appends `year=<value>` with `?` or `&`; `retainedParams` maps the whitelist over `url.searchParams.get`, skipping nulls; `seasonChoices` is `seasonOptions` plus the selected year appended (labelled via `seasonLabel`) when absent. Remove the old `parseInt` body and its long doc comment; keep one line on why 4 digits (backend regex `/^\d{4}$/`).
- [ ] **Step 4:** Rerun; expect PASS. Also `npx vitest run` (whole web suite) to confirm Matches/Sales callers of `parseSeasonYearParam` still pass.

## Task 2: initials helper (TDD)

- [ ] **Step 1:** `user.spec.ts`: `initialsFromEmail`: "when the local part has a dot or dash" (`jean.dupont@x.fr` gives `JD`); "when the local part is one word" (`sufiane@x.fr` gives `SU`); "when the email is empty" gives `?`; result is uppercase.
- [ ] **Step 2:** Run `npx vitest run src/lib/user.spec.ts`; expect FAIL.
- [ ] **Step 3:** Implement `export function initialsFromEmail(email: string): string` in `user.ts`: split local part on `[._-]`, first letters of the first two non-empty words, else first two chars; `?` when empty.
- [ ] **Step 4:** Expect PASS.

## Task 3: accounting scope helper (TDD)

**Interface:** `resolveAccountingScope(url: URL, now?: Date): { view: 'current' | 'all-time' | 'season'; year: SeasonYear | null }`. Rules: `year=all` gives all-time; `year=<n>` gives season n (even when n is current); year absent and `view=all-time` gives all-time (legacy); otherwise current with `year: null`.

- [ ] **Step 1:** `accounting-scope.spec.ts`: "when year is absent" (current, null); "when year is 2025" (season, 2025); "when year is all" (all-time, null); "when year is absent and view is all-time" (all-time); "when year is 2025 and view is all-time" (season 2025, year wins); "when year is invalid" (current).
- [ ] **Step 2:** Run it; expect FAIL. Implement using `parseSeasonParam`. Expect PASS.

## Task 4: loads

- [ ] **Step 1: Dashboard** `+page.server.ts`: `const season = resolveSeason(event.url, false)`; `const isCurrent = season === seasonStartYearFromDate(new Date())`; accounting path `/accounting/current-season` when current else `/accounting/season/${season}`; matches path likewise `/matches/current-season?withResult=true` or `/matches/season/${season}?withResult=true`. Keep both promises unawaited. Actions untouched.
- [ ] **Step 2: Season** `+page.server.ts`: `const year = resolveSeason(event.url, false) as SeasonYear` replaces the `parseInt` block; delete its local `currentSeasonStartYear`. `+page.svelte`: delete the season `<form>`/`<select>` and `years`; keep the rest, including the hidden `seasonStartYear`.
- [ ] **Step 3: Accounting** `+page.server.ts`: use `resolveAccountingScope`; path `/accounting/all-time` (amortization `null`), `/accounting/season/${year}` (amortization `year`), or current-season (amortization current). Return `{ accounting, amortization, view: scope.view, year: scope.year }` (same shape as today). `+page.svelte`: delete the tab bar and season form and the `currentYear`/`years` consts; keep the `h1`; replace `new Date().getFullYear()` in the `/season?year=` link with `seasonStartYearFromDate(new Date())`.
- [ ] **Step 4: Sales** `+page.server.ts`: `const season = resolveSeason(event.url, true)`; `const current = seasonStartYearFromDate(new Date())`.
  - `season === current`: `/sales/grouped` as today, `year = null`, `salesGroup = grouped`.
  - `season === 'all'`: `Promise.all(seasonOptions(new Date(), 6).map((option) => api<SaleListItem[]>(event, \`/sales/season/${option.year}\`)))`, `sales = results.flat()`, `salesGroup = null`, `year = null`.
  - otherwise past: `/sales/season/${season}`, `year = season`, `salesGroup = null`.
  - `canCreate = season === 'all' || season === current` (same truth table as today: null or current). Return `season` additionally. Redirect targets in the three actions already forward `?year=`; keep.
  `+page.svelte`: delete the season `<form>` (lines near `id="year"`), the `years` derived and its comment, and any now-unused imports (`seasonLabel`, `SeasonYear` if unused). Do not touch the edit drawer, new-sale panel or table.
- [ ] **Step 5: Matches** `+page.svelte`: delete the season `<select>` block and `years`; inside the existing GET form add `{#if data.year !== null}<input type="hidden" name="year" value={data.year} />{/if}` so venue and competition submits keep the season. Load unchanged.
- [ ] **Step 6:** `cd web && npm run check && npm run typecheck && npx vitest run`; expect PASS. Quick manual: `/dashboard?year=2025` shows 2025 data; `/accounting?year=all` shows all-time; `/accounting?view=all-time` still all-time; `/sales?year=all` lists rows from several seasons; `/sales` unchanged (pending first).

## Task 5: shell components

- [ ] **Step 1: `SeasonSelect.svelte`.** Props none; reads `page.url`. `scope = $derived(seasonScope(page.url.pathname))`; render nothing when `none`. `selected = $derived(resolveSeason(page.url, scope === 'season-or-all'))`; `choices = $derived(seasonChoices(new Date(), 6, selected === 'all' ? null : selected))`. Markup: `<form method="GET" data-sveltekit-keepfocus>`, hidden inputs from `retainedParams(page.url)`, `<label for="season-select" class="sr-only">Season</label>`, `<select id="season-select" name="year" onchange={(event) => event.currentTarget.form?.requestSubmit()}>`, options `value={choice.year}` labelled `choice.label`, plus `<option value="all">All seasons</option>` only for `season-or-all`; token styling like the existing selects (`border-line-strong bg-surface text-ink`), 44 px touch height on mobile. Add `<noscript><button type="submit">Apply</button></noscript>`.
- [ ] **Step 2: `UserMenu.svelte`.** Prop `email: string`. `<details bind:this={menu}>`; `<summary aria-label="Account menu">` shows a round `initialsFromEmail(email)` badge (`bg-surface-strong text-ink`); panel (`absolute right-0`, `bg-surface border border-line-strong rounded-lg`) with the email (`truncate`, `title`) and `<form method="POST" action="/logout"><button type="submit">Sign out</button></form>`. `svelte:window` `onkeydown` closes on Escape (`menu.open = false`, focus summary), `onclick` closes when the target is outside `menu`; `afterNavigate` from `$app/navigation` closes it. Respect `prefers-reduced-motion` (no transition).
- [ ] **Step 3: `+layout.svelte`.** Remove the `ThemeToggle` import and element, the email span and the inline sign-out form. Right cluster becomes `<SeasonSelect /><UserMenu email={user.email} />`. Nav `href` becomes `carrySeason(item.href, page.url)`; active item classes `bg-surface-strong text-ink border-b-2 border-brand`, inactive `text-ink-muted hover:text-ink border-b-2 border-transparent`. Brand link gets `font-display`. Keep `aria-label="Primary"`, `aria-current`, the scrollable mobile strip, the service-worker effect and `ToastHost`. Delete `web/src/lib/ui/ThemeToggle.svelte`.
- [ ] **Step 4:** `grep -rn "ThemeToggle\|data-theme" web/src`; expect none.

## Task 6: verify

- [ ] **Step 1:** Gate in `web/`: `npm run check && npm run typecheck && npm test && npm run build && test -f .svelte-kit/cloudflare/_worker.js`. Expect all PASS.
- [ ] **Step 2:** e2e `auth`, `sale`, `season-pass` (from `e2e/`); expect green. `sale` matters most: the Sales load changed. If a spec reaches for the removed "Season" control or "Sign out", update the spec to the new header and note it in the PR.
- [ ] **Step 3: Manual (via `/run`).** Tab through the header: brand, five nav links, selector, avatar; open the avatar with Enter or Space, Escape closes and returns focus; sign out works by keyboard. On each of the five pages change the selector and check the URL and content update; click nav links and confirm `year` carries; from `/sales?year=all` click Dashboard and confirm the URL has no `year=all`; confirm the selector is absent on `/sales/new`, `/matches/<id>` and `/admin/matches`; confirm Matches venue filter keeps `year`; mobile width scrolls the nav strip; no theme control anywhere.
- [ ] **Step 4:** Stage; stop for `/crit`. Commit message when told: `feat(web): rebuild app shell with season selector and user menu`.

## Acceptance

Header shows only brand, nav, selector, avatar. Sign-out reachable by keyboard. No theme control. `year` survives nav clicks; `all` only reaches Sales and Accounting. Selector value always matches what the page shows (Matches with `year=all` shows the current season). No page renders a second season control. Dashboard, Season, Accounting and Sales respond to `year`. All new helpers have specs. Gate and e2e green.

## Notes for PSG-80..83 (also in the spec, section 7)

Read the season only through `resolveSeason`; wrap in-page hrefs with `carrySeason`; add new filter params to the `retainedParams` whitelist; Sales load already returns `season`; PSG-82 must not "correct the default" (spec section 2); `year=all` on Sales is the six-season fan-out, replace it if a backend `GET /sales/all` ever ships.

## Self-review

- Spec coverage: URL contract (T1), scope table (T1, T5), nav carry (T1, T5), selector form and whitelist (T1, T5), loads (T3, T4), per-page controls (T4), shell (T5), initials (T2).
- Type consistency: `SeasonYear | 'all'` is the only season union; `year` in loads keeps `SeasonYear | null`.
- Known risk: Sales load is the only behaviour change on a hardened page; the e2e `sale` spec and the manual `/sales` check guard it.
