# Accounting matchday strip: home / away / all filter

Follow-up to `docs/specs/2026-11-20-matchday-strip-scroll-design.md` and PSG-83. Web only, no backend change.

Status: approved. User decisions: default `All`, strip-only scope, and suggestion S2 (home/away marker on cards) is in scope.

## Problem

The "match chat" is the `MatchdayStrip` on `/accounting` (`web/src/lib/ui/MatchdayStrip.svelte`, fed by `stripSegments()` in `web/src/lib/accounting-view.ts`, rendered from `web/src/routes/(app)/accounting/+page.svelte`). It shows one card per fixture of the season. The user mostly sells home games, so away cards are grey "no sale" noise that pushes the useful cards off screen.

## Findings (verified in code)

- Data source: `GET /matches/current-season` or `/matches/season/:y` returns `FormattedMatch[]`, which already has `atHome: boolean` (`web/src/lib/types.ts`). No backend work.
- `StripSegment` does not carry `atHome` today. It must be added (the only data change).
- The same filter already exists on `/matches` as `?venue=both|home|away` (server-side filter, `web/src/routes/(app)/matches/+page.server.ts`). `venue` is already in `RETAINED_PARAMS` in `web/src/lib/season.ts`, so the season selector form already preserves it across season changes. Reusing the same param name and values gives consistency for free.
- Only the strip lists all fixtures. `SeasonMatchTable` already omits matches without sales (`tableGroups`). Headline figures, math block and amortisation come from backend aggregates over all sales.

## Decisions

### D1. Filter scope: strip only

The filter changes only which cards the strip shows. Everything else stays season-wide: four headline figures, amortisation block (home-only pass cost per match, already computed from `homeMatchCount`), "How net profit is calculated", per-sale table and its footer, Details. Reason: those figures reconcile with each other and with the backend. A filtered subset beside an unfiltered net profit would read as an error. The filter control sits directly above the strip, and the strip is the only thing that reacts, which makes the scope visible without extra copy.

Rejected: also filtering the table. The table already hides no-sale matches, so the noise problem does not exist there, and a filtered footer would disagree with the headline net.

### D2. Values, param, default

`venue` = `both | home | away`, same as `/matches`. Missing or invalid value resolves to the default.

Recommended default: `both`. Reason: defaulting to Home silently hides away matches that do have sales (the user does sell away tickets sometimes, hence "most of the time"), and `/matches` defaults to `both`. The cost is one click for the user's normal case; see open question Q1 for flipping it (one constant, plus the "both" URL has to be written explicitly).

### D3. Persistence: URL param only

State lives in `?venue=`. It survives reload, back/forward, sharing, and season switching (already retained). Rejected: localStorage. It needs client-only code, causes a hydration flash from the default to the stored value, and creates a second source of truth beside the URL that `/matches` already uses. Revisit only if the user wants "remember Home forever" (that is Q1's alternative).

`both` is written as the absence of the param (clean URL) when the default is `both`.

### D4. Control

Reuse `FilterTabs` (`web/src/lib/ui/FilterTabs.svelte`): three links `All` / `Home` / `Away`, `label="Venue"`, active tab marked with `aria-current`. Hrefs come from a pure helper `venueHref(url, venue)` that clones the current URL, sets or removes `venue`, and keeps `year`/`view` and other params. Links, not a form, so no hidden-input bookkeeping. Add `data-sveltekit-noscroll` and `data-sveltekit-keepfocus` on the wrapper so the page does not jump.

Label wording: "All" (not "Both", which is the URL value) in the UI.

Note: navigating changes the URL, so SvelteKit may re-run `+page.server.ts` and the strip briefly shows the skeleton. Acceptable (same as the season selector). Plan task 4 checks it; if it flickers badly, switch to shallow `replaceState` as a follow-up, not now.

### D5. Interaction with the rest of the strip

- Centring on the next upcoming fixture already re-runs when `segments` changes (the `$effect` depends on it), so after filtering it re-centres on the next upcoming card of the filtered list. `upcomingIndex` is unchanged and operates on the filtered list.
- Break-even star: the break-even match has a SOLD sale. If the filter hides it (for example an away break-even match under Home), the star disappears from the strip. Covered by the hidden-sales hint below, which is the honest signal.
- Hidden-sales hint: when `venue !== 'both'` and one or more hidden matches have a sale (status not null), show one line under the control: "3 away matches with sales are hidden." (or "home"). Not shown when the count is 0. This prevents the silent-data-hiding failure mode of D2.
- No change to the legend.
- Away cards are marked (S2, see D7).

### D6. Empty states

- Season has no matches at all: unchanged (page already renders neither strip nor filter).
- Filter yields zero cards (for example `away` when no away fixtures are loaded, or `home` on an all-away list): keep the filter visible, replace the strip with "No home matches this season." / "No away matches this season." plus no legend. The control stays so the user can switch back.
- `year=all`: strip and filter are not rendered (unchanged, season-only).

### D7. Home/away marker on cards (S2)

Away cards show the opponent prefixed with `@` (`@ Rival FC`), home cards are unchanged. The card `aria-label`/`title` gains `, away` for away matches. The legend gains one entry, `@ away`. Text prefix chosen over a tag: no extra row, no layout change in the 96px card, works in every venue view. Helper `stripOpponent(segment)` in `accounting-view.ts`.

## Data and code shape

- `accounting-view.ts`:
  - `StripSegment` gains `atHome: boolean`; `stripSegments()` fills it from `match.atHome`.
  - `type Venue = 'both' | 'home' | 'away'` (same values as `/matches`).
  - `parseVenue(value: string | null): Venue` (invalid or null gives `'both'`).
  - `filterSegments(segments, venue): StripSegment[]`.
  - `hiddenWithSales(segments, venue): number`.
  - `venueHref(url: URL, venue: Venue): string`.
- `+page.svelte`: derive `venue` from `page.url`, compute filtered segments, render `FilterTabs`, hint, empty message, `MatchdayStrip`.
- `MatchdayStrip.svelte`: render `stripOpponent(segment)`, add `, away` to the card label, add `@ away` legend entry (S2).
- Branded types: `Venue` is a closed union, not a brand candidate. No new ids or money.

## Testing

- Vitest (`accounting-view.spec.ts`), nested `describe` per condition: `parseVenue`, `filterSegments`, `hiddenWithSales`, `venueHref`, `stripSegments` carrying `atHome`, and `stripOpponent`.
- e2e (`e2e/tests/accounting.e2e-spec.ts`, already in `testMatch`): seeded match is home (`scripts/seed-e2e.ts`). `?venue=home` shows the seeded opponent in the strip; `?venue=away` shows "No away matches this season." and no seeded opponent; clicking the Home tab sets `venue=home`.
- Manual: 360px and 1280px; keyboard tab to the filter links; check the season selector keeps `venue`.

## Out of scope (core)

Has-sales filter, hiding empty past matches, competition filter, localStorage persistence, clickable cards, backend changes, table/figures filtering.

## Resolved questions

- Q1. Default is `All`.
- Q2. Strip only.
