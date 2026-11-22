# Accounting strip venue filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Builder: `frontend-builder` only. No backend task.

**Goal:** Add a home / away / all filter above the accounting matchday strip, driven by `?venue=`, scoped to the strip only.

**Spec:** `docs/specs/2026-11-21-accounting-strip-venue-filter-design.md`

**Tech:** Svelte 5 runes, Tailwind 4, Vitest (node env), Playwright. No new deps. Global constraints from `docs/plans/2026-11-20-psg-83-accounting-page-plan.md` apply (no comments, explicit return types, no inline `if`, blank line before `if/for/return`, no single-letter names, conventional commit `feat(web): ...`, stage and stop for `/crit`).

## Size and ticket split

Estimate about **190 lines** total: helpers + spec ~95, page wiring ~45, e2e ~30. One PR, one layer (web), one actor (staff). No split. No backend work, so nothing to parallelise: single `frontend-builder`.

## Files

- Modify `web/src/lib/accounting-view.ts`, `web/src/lib/accounting-view.spec.ts`
- Modify `web/src/routes/(app)/accounting/+page.svelte`
- Modify `e2e/tests/accounting.e2e-spec.ts`
- Modify `web/src/lib/ui/MatchdayStrip.svelte` (S2 marker)
- Unchanged: `FilterTabs.svelte`, `season.ts` (`venue` already retained), backend.

## Task 1: `atHome` on `StripSegment` (TDD)

- [ ] Failing test in `accounting-view.spec.ts`: `describe('when the match is away')` -> segment `atHome` is false; `describe('when the match is at home')` -> true (the `match()` helper already takes `atHome`).
- [ ] Add `atHome: boolean` to `StripSegment`, fill from `match.atHome` in `stripSegments`. Fix any other `StripSegment` literal in specs (`upcomingIndex` tests) with `atHome: true`.
- [ ] `npx vitest run accounting-view` in `web/`.

## Task 2: venue helpers (TDD)

- [ ] Add tests, one `describe` per condition:
  - `parseVenue`: `'home'`, `'away'`, `'both'` pass through; `null` and `'garbage'` give `'both'`.
  - `filterSegments`: `both` returns all in order; `home` keeps only `atHome`; `away` keeps only away; empty input gives empty.
  - `hiddenWithSales`: `both` gives 0; `home` counts away segments whose `status !== null`; away segments with no sale are not counted; `away` counts home segments with sales.
  - `venueHref`: setting `home` adds `venue=home` and keeps `year`; setting `both` removes `venue`; other params (`view`) preserved; returns path + search only (no origin).
- [ ] Implement in `accounting-view.ts`: `export type Venue = 'both' | 'home' | 'away'`, `parseVenue`, `filterSegments`, `hiddenWithSales`, `venueHref`. `Venue` values must equal the `/matches` page values. Use `status !== null` (not `!!`).
- [ ] Run vitest, green.

## Task 3: wire the page

In `+page.svelte`, inside the `{#if view.matches.length > 0}` block:

- [ ] `const venue = $derived(parseVenue(page.url.searchParams.get('venue')))` in the script (`page` already imported).
- [ ] Compute `segments = stripSegments(...)` once, `visible = filterSegments(segments, venue)`, `hidden = hiddenWithSales(segments, venue)` with `{@const}`.
- [ ] Render `FilterTabs` with `label="Venue"` and tabs `All` / `Home` / `Away`: `href: venueHref(page.url, value)`, `active: venue === value`. Wrap in an element with `data-sveltekit-noscroll data-sveltekit-keepfocus`.
- [ ] When `hidden > 0`: one line, `text-xs text-ink-faint`, "`{hidden}` away/home match(es) with sales hidden." (singular/plural; word is the venue that is hidden: venue `home` hides away).
- [ ] When `visible.length === 0`: `<p class="text-sm text-ink-faint">No {venue} matches this season.</p>` instead of the strip. Otherwise `<MatchdayStrip segments={visible} />`.
- [ ] Do not touch figures, amortisation, math block, table or Details.

## Task 3b: home/away marker on cards (S2, TDD)

- [ ] Failing test in `accounting-view.spec.ts`: `describe('stripOpponent')` -> `when the match is away` returns `@ Name`; `when the match is at home` returns `Name`.
- [ ] Add `stripOpponent(segment)` to `accounting-view.ts`.
- [ ] `MatchdayStrip.svelte`: render `stripOpponent(segment)` as the opponent line, append `, away` to the card label for away matches, add an `@ away` legend entry (~10 lines).

## Task 4: e2e + manual check

- [ ] In `accounting.e2e-spec.ts` add a test group (nested `describe`s) using the seeded home match:
  - `when venue is home`: `goto('/accounting?venue=home')`, strip lists `E2E_OPPONENT_NAME`.
  - `when venue is away`: `goto('/accounting?venue=away')`, text "No away matches this season." visible, `E2E_OPPONENT_NAME` absent from the strip region.
  - `when clicking the Home tab`: from `/accounting`, click link `Home` inside nav "Venue", `expect(page).toHaveURL(/venue=home/)`.
- [ ] `accounting` is already in `testMatch` in `e2e/playwright.config.ts`; no config change.
- [ ] Manual: 360px and 1280px, keyboard focus on the tabs, season selector keeps `venue`, strip re-centres on next upcoming after toggling, check whether the strip skeleton flickers on toggle (note in PR if so; do not fix here).
- [ ] From `web/`: `npm run check`, `npm run lint`, `npx vitest run`; do not claim done on build exit code alone.
- [ ] Stage and stop for `/crit`. Commit message: `feat(web): add home/away filter to accounting matchday strip`.

## Out of scope

Has-sales filter, hide-empty-past-matches, competition filter, localStorage persistence, clickable cards.
