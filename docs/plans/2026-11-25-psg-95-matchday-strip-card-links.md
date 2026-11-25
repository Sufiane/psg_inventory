# PSG-95 Matchday strip card links Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Every card in the accounting matchday strip links to `/matches/[matchId]`.

**Spec:** `docs/specs/2026-11-25-psg-95-matchday-strip-card-links-design.md`

**Size / split:** one PR, about 40 lines, web only, single ticket, no split. Branch `psg-95` (rename if Conductor named it otherwise, before first push). Conventional commits (`feat(accounting): link matchday strip cards to the match page`); stage, do not commit before the user runs `/crit`.

**Architecture:** edit `web/src/lib/ui/MatchdayStrip.svelte` only (plus e2e). No backend, no shared types.

---

### Task 1: e2e test first (fails today)

**Files:** modify `e2e/tests/accounting.e2e-spec.ts`.

- [ ] In the first test, replace the `strip.getByRole('listitem', { name: new RegExp(E2E_OPPONENT_NAME) })` assertion with `strip.getByRole('link', { name: new RegExp(E2E_OPPONENT_NAME) })`, `toHaveCount(1)`.
- [ ] Add `test.describe('when clicking a matchday card')` with test `navigates to the match page`: goto `/accounting`, click that link, `await expect(page).toHaveURL(/\/matches\/[^/]+$/)`, expect a heading containing `E2E_OPPONENT_NAME` visible (check `MatchInspector.svelte` for the exact heading text first).
- [ ] Add `test.describe('when the match has no sales')`: only if the seed has a sales-free match; otherwise skip and note it (spec decision 2 is covered by `MatchInspector` already rendering the empty state).
- [ ] Run `npx playwright test accounting` from `e2e/` per its README and confirm the new assertions fail (no link role yet).

### Task 2: make cards links

**Files:** modify `web/src/lib/ui/MatchdayStrip.svelte`.

- [ ] In the `{#each}` block, remove `aria-label={label}` and `title={label}` from `<li>`.
- [ ] Wrap the three child spans in `<a href="/matches/{segment.matchId}" aria-label={label} title={label} class="block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 hover:opacity-90">`.
- [ ] Keep `label` derivation, fills, break-even star, legend, scroll-centring `querySelectorAll('ol > li')` untouched (li still the direct child of ol).
- [ ] Style rules from repo: no inline `if`, no comments unless non-obvious.

### Task 3: verify

- [ ] `cd web && npm run check && npm run lint && npm test` all pass (no unit changes expected).
- [ ] Re-run `npx playwright test accounting` from `e2e/`; new and existing venue-filter tests pass.
- [ ] Manual: `/accounting?venue=home`, click a card, press browser back, confirm the venue tab is preserved; Tab key reaches each card and shows a focus ring; horizontal scroll and fades still work.
- [ ] Stage changes and stop; tell the user to run `/crit`.

### Out of scope (file as separate tickets only if wanted)

- `/sales?matchId=` filter (backend or server-load filter plus UI).
- Linking cards on dashboard or season table.
