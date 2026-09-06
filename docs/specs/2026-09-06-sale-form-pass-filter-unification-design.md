# Unify season-pass filtering across all four sale-form entry points — design

Date: 2026-09-06
Status: approved

## Problem

The 2026-09-04 fix stopped the sale forms offering passes from the wrong season, but only
on the two **standalone** routes: `/sales/new` and `/sales/[saleId]`. The sales list screen
carries two more sale forms as inline panels — `?new=1` and `?edit=<id>` — and both were
left out of that fix. They still render `data.passes` unfiltered, so both still offer every
pass from every season.

The same screen has a second, independent bug: its `load` ignores the season the user has
selected. `web/src/routes/(app)/sales/+page.server.ts:32` fetches `/matches/current-season`
regardless of `?year=`, so opening the new-sale panel while viewing season 2023 lists only
*current*-season matches. A 2023 sale cannot be logged from the 2023 view at all.

Meanwhile the filtering rule now exists in two hand-written copies (one client-side in
`new/+page.svelte`, one server-side in `[saleId]/+page.server.ts`) and is about to need two
more. That is the actual thing to fix: one rule, one implementation, four call sites.

## Scope decision (settled before this spec)

Option C: **extract the shared rule and wire it into the existing four entry points.** The
inline panels stay inline. No route consolidation, no redirecting the panels at the
standalone pages, no navigation or UX restructuring. This is a correctness + de-duplication
change, and the screen behaves the same except that wrong-season passes disappear and the
match list respects the selected season.

## The rule

A pass is offered on a sale form when:

```
pass.seasonStartYear === seasonStartYearFromDate(match.date)
  OR  pass.id is already allocated to the sale being edited
```

The second clause — the union rule established by the prior fix — exists so an edit form
never silently drops tickets. If a mismatched allocation somehow existed, hiding its input
would zero it on the next save and change `nbTickets` without the user seeing anything. It
applies to the two **edit** contexts and is a no-op for the two **create** contexts, where
there is nothing allocated yet.

Backend is already correct and is not touched. `SalesService.validateAllocations()` enforces
the same invariant on `addSale` and `updateSale`, `GET /season-passes?season=YYYY` and
`GET /matches/season/:seasonStartYear` both already exist, and both match endpoints return
`FormattedMatch[]` ordered `date asc`. **This change is frontend-only.**

## Decisions

### 1. The helper lives in a new `web/src/lib/sale-passes.ts`, not in `season.ts`

```ts
export function passesForMatch(
    passes: SeasonPass[],
    matchDate: Date | string | null | undefined,
    keepPassIds?: ReadonlySet<SeasonPassId>,
): SeasonPass[]
```

- Returns `[]` when `matchDate` is nullish. That is the "no match picked yet" case; the
  caller distinguishes it from "this season has no passes" by testing the selected match
  itself, which is what `new/+page.svelte` already does.
- Accepts `Date | string` because the edit contexts hold an ISO string
  (`sale.Match.date`, `editSale.Match.date`) and the create contexts hold a
  `FormattedMatch.date`. Normalising inside the helper keeps four `new Date(...)` calls out
  of the call sites.
- Preserves input order and returns a new array. Off-season passes retained by
  `keepPassIds` stay interleaved in their original position — same as today's
  `[saleId]/+page.server.ts` behaviour.
- Pure and isomorphic: no browser APIs, so it runs unchanged in a `+page.server.ts` `load`
  and in a `$derived` in the browser. That is what lets one function serve both
  server-filtered and reactively-filtered call sites.

`season.ts` stays a pure date/season primitive module with no domain types. `sale-passes.ts`
sits beside the existing `sale-allocations.ts`, which is already the established home for
"logic shared by the sale forms". `season.ts` gains one thing only: `seasonLabel(year)`
returning `"2025/2026"`, which is currently inlined in `new/+page.svelte` and would
otherwise be duplicated into the inline new panel.

### 2. The sales-list pass load stays **unfiltered** — deliberately

The initial framing of this work called for adding `?season=` to
`web/src/routes/(app)/sales/+page.server.ts:28`. That would be wrong.

`data.passes` on that page has three consumers, and one of them needs every season:
`ImportSalesModal` (`web/src/lib/ui/ImportSalesModal.svelte`) buckets the list by
`seasonStartYear` and renders an explicit "Current season" group *and* a "Previous seasons"
group, plus a guard that rejects a selection spanning two seasons. Season-scoping the load
would permanently empty the "Previous seasons" group and break importing into a past season.

So the load keeps returning the full set, and the two inline panels narrow it at render time
via `passesForMatch`. This also happens to be the only shape that works for the `?new=1`
panel, where the season is not known at load time — it is whatever match the user picks in
the form.

Same reasoning already applies to `new/+page.server.ts:11`, which likewise keeps loading all
passes. Both are correct as-is.

### 3. The match load stays `/matches/current-season`, gated by a server-computed `canCreate`

An earlier draft of this fix made the match fetch season-aware
(`/matches/season/:seasonStartYear` when `?year=` was set). That was reverted before
shipping: new sales can only ever be logged against the current season anyway (the kickoff
guard on `updateSale` means a past-season sale could never be marked SOLD, so offering a
past season's matches in the panel would just be dead-end UI). The correct fix is not to
fetch a different season's matches — it's to decide, server-side, whether "+ New sale" is
even offered for the selected season, and skip the fetch entirely when it isn't.

`load` computes:

```ts
const canCreate = seasonYear === null || seasonYear >= seasonStartYearFromDate(new Date());
```

using `seasonYear` (not raw `year` — see the round-2 review fix below), and only fetches
`/matches/current-season` when `isNew && !editId && canCreate`. `>=` rather than `===`
because the backend's current-season bucketing (`getCurrentSeason`, buckets on
`earliestUpcoming ?? now`) can roll over to next year's season before the calendar year
does — a future `seasonYear` can already be a season the backend is actively serving
matches for, and blocking it with `===` would be a false negative.

`canCreate` is returned from `load` and drives both the "+ New sale" link/fallback-message
gate and the `isNew` derivation in `+page.svelte`, replacing an earlier client-side
`isCurrentSeasonSelected` derivation that used `===` and read the raw (unsanitized) `year`
param — both bugs fixed in the same pass, since computing the flag server-side against the
sanitized `seasonYear` is what fixes them.

The matches fetch stays inside the existing `if (isNew && !editId)` guard, now further
gated by `canCreate`. The edit panel does not need a match list; the sale's match is fixed.

### 4. The inline new panel needs a bound match `<select>`

Today the panel's `<select name="matchId">` is uncontrolled. Filtering reactively requires
the selection in state, so it gains `bind:value={newSaleMatchId}` alongside its existing
`bind:this={newPanelFirstEl}`. The state resets when the panel closes so a second open does
not inherit the previous pick.

Empty states mirror `/sales/new` exactly, for consistency between the two new-sale forms:

| Condition | Rendered instead of the pass list |
|---|---|
| no match picked | "Pick a match first — only passes from that match's season can be used." |
| match picked, no pass that season | "No season pass for 2023/2024 — create one before logging this sale." (links `/season`) |

### 5. The inline edit panel replicates the union rule client-side

`editSale.Allocations` is already available in the component (the panel reads it to seed each
input's current value), so the union is computed in a `$derived` rather than in `load`:

```
allocatedIds  = new Set(editSale.Allocations?.map(a => a.seasonPassId))
visiblePasses = passesForMatch(data.passes, editSale.Match.date, allocatedIds)
```

This differs in *placement* from the standalone edit page, which computes the same union in
`load` because its `+page.server.ts` fetches the sale anyway. Both call the same function
with the same arguments and produce the same list. The inline panel cannot move it into
`load` cheaply — `load` returns one `passes` array shared with the new panel and the import
modal, and season-scoping it there would break both (decision 2).

The `idx === 0` test that assigns `bind:this={firstFieldEl}` now indexes the *filtered*
array, so focus still lands on the first visible input.

If the filtered list is empty the panel renders a short hint rather than an empty fieldset.
This is practically unreachable — a sale always carries at least one allocation, and every
allocated pass is retained by the union — but an empty fieldset with no explanation is a bad
failure mode to leave open.

### 6. Season dropdown offers season years, not calendar years

`+page.svelte:46` seeds its six-year dropdown from `new Date().getFullYear()`. That is a
calendar year, so between January and July it offers a season that has not started —
in March 2027 it lists 2027, and picking it now yields an empty sales list *and*, after this
change, an empty match list. Switch the seed to `seasonStartYearFromDate(new Date())`.

Included because this change is what makes the stale entry reachable in a second place
(the match list), and it is a one-line fix in a file already being edited.

**Round-2 review correction:** the option *labels* were left as bare years in the original
plan, on the reasoning that relabelling them was a separate UX change. That reasoning did
not hold: switching the underlying `<option value>` from a calendar year to a season-start
year silently changes what the same-looking number *means* for eight months of the year
(Jan-Jul) without any visible change to the label. A user picking "2027" in March 2027 was
getting the 2027/2028 season, indistinguishable in the UI from the old calendar-year
behaviour. The labels now use `seasonLabel(year)` (e.g. "2023/2024"), matching the phrasing
already used in both panels' empty states.

**Round-2 review correction (years list):** the original six-season window (`currentSeason`
down through `currentSeason - 5`) silently drops a bookmarked or hand-typed `?year=` that
falls outside it. No `<option>` then matches `data.year`, the `<select>` falls back to its
first option, and the page reads "Current" while actually showing a different season's data
— a lying dropdown, not just a missing entry. Fixed by unioning `data.year` into the window
whenever it falls outside it:

```ts
let years = $derived.by(() => {
    const base = Array.from({ length: 6 }, (_, i) => currentSeason - i);

    if (data.year !== null && !base.includes(data.year)) {
        return [...base, data.year].sort((first, second) => second - first);
    }

    return base;
});
```

Reactive (`$derived.by`, not a `const`) because `data.year` changes on every `?year=`
navigation and the dropdown must stay in sync without a full reload. The union entry sorts
into place by season-start year (descending, matching the base window's order) rather than
being appended at the end, so the list stays chronologically ordered regardless of where the
out-of-window year falls.

### 7. Verification is type-check plus a manual script

`web/` still has no test runner — no vitest, no `test` script, and CI does not run `web`
typecheck. That has not changed since 2026-09-04 and adding it is still a separate change
with its own review surface. Verification here is `npm run check` and `npm run typecheck`
in `web/`, plus the browser script in the plan.

**Named follow-up (restated, not dropped):** *add vitest to `web/`, covering
`seasonStartYearFromDate`, `seasonLabel` and `passesForMatch`, and wire `web` typecheck +
tests into CI.* This change strengthens that case: `passesForMatch` is now the single point
of failure for four forms, it is a pure function with an obvious table of cases (in-season,
off-season, nullish date, union retention, order preservation), and it is exactly the kind
of thing that should not be guarded by manual clicking.

## Files touched

| File | Change |
|---|---|
| `web/src/lib/sale-passes.ts` | **New.** `passesForMatch(passes, matchDate, keepPassIds?)`, plus `passesForSale(passes, sale)` — the sibling that builds the allocated-id set from `sale.Allocations` for the two edit call sites. |
| `web/src/lib/season.ts` | Add `seasonLabel(year)` and `seasonLabelFromDate(date)`. `seasonStartYearFromDate` unchanged. |
| `web/src/routes/(app)/sales/new/+page.svelte` | Replace the inline filter with `passesForMatch`; use `seasonLabel`/`seasonLabelFromDate`. |
| `web/src/routes/(app)/sales/[saleId]/+page.server.ts` | Replace the inline union filter with `passesForSale`. |
| `web/src/routes/(app)/sales/+page.server.ts` | Hoist `seasonYear` and return it (not the raw `year` param) as `year`; compute `canCreate` server-side and gate the `/matches/current-season` fetch on it. |
| `web/src/routes/(app)/sales/+page.svelte` | Bind the new panel's match select; filter both inline panels via `passesForMatch`; empty states (with focus preserved on the empty-state link); season-correct, season-labelled year dropdown; gate "+ New sale" and the new-sale panel on `data.canCreate`. |

Deliberately **unchanged**: `web/src/routes/(app)/sales/+page.server.ts:28` (pass load stays
unfiltered — `ImportSalesModal`); `web/src/routes/(app)/sales/new/+page.server.ts` (same
reason plus the season is unknown at load); `web/src/lib/ui/ImportSalesModal.svelte`;
`web/src/routes/(app)/sales/[saleId]/+page.svelte`; every file under `src/`.

## Behaviour after the change

| Situation | Before | After |
|---|---|---|
| `/sales?new=1`, no match picked | All passes, all seasons | "Pick a match first" hint |
| `/sales?new=1`, match picked | All passes, all seasons | Only that season's passes |
| `/sales?edit=<id>` | All passes, all seasons | Sale's season, plus anything already allocated |
| `/sales?year=2023&new=1` | "+ New sale" offered, current-season match list | "+ New sale" hidden with a "past season" message — `canCreate` is false for a strictly-past `seasonYear` (unchanged end-state from before this fix; the match-fetch season-awareness considered in an earlier draft was reverted) |
| `/sales/new`, `/sales/<id>` | Already filtered | Identical output, now via the shared helper |
| Import CSV modal | Groups every season | Unchanged |
| Crafted cross-season POST | 400 `SALE_ALLOCATION_PASS_MISMATCH` | Unchanged |

With JS disabled, `newSaleMatchId` starts empty and never gets bound to a selection, so the
inline new panel's SSR render lands in the "Pick a match first" state with zero pass inputs —
same as the pre-existing `/sales/new` behaviour, not a regression from this change. The inline
*edit* panel and the standalone edit page both filter without JS (server-side /
hydration-independent respectively).

## Known follow-up (deferred, not fixed by this change)

**A next-season sale can be created before the season dropdown has an option for it.**
`MatchesService.getCurrentSeason` (`src/api/matches/matches.service.ts`) rolls its notion of
"current season" over on `earliestUpcoming` — the first future fixture. The sales screen's
own season computation runs on two different clocks that don't roll over at the same moment:

- The new-sale match picker gets its season from the backend's `getCurrentSeason` (via
  `canCreate` and `/matches/current-season`), so it rolls over as soon as next season's
  first fixture exists.
- `SalesService.getCurrentSeasonSales` and the dropdown's own `years` list
  (`+page.svelte`'s `currentSeason = seasonStartYearFromDate(new Date())`) roll over on the
  calendar date (August 1 UTC), independent of fixtures.

For a narrow window at each season boundary — next season's fixtures already exist *and* a
season pass for that season already exists, but the calendar has not yet crossed into
August — the match picker can already offer a next-season match while the dropdown's window
still tops out at the current (soon-to-be-previous) season. A sale created against that
match lands in a season the dropdown has no option for: it disappears from the list (the
union-into-`years` logic in decision 6 only helps once `?year=` is actually set to that
season) until the user manually types or bookmarks the right `?year=`.

Reaching this requires both preconditions at once (next season's fixtures scheduled early,
and a pass already created for that season), so it is narrow, but it is a real gap this
change does not close — decision 6's union logic fixes the "stale `?year=` on a normal
visit" case, not "the create flow itself lands the user somewhere the dropdown doesn't
reach."

**Suggested fix direction (not designed or scoped here):** after a successful `create`
action, redirect to the created sale's own season (`?year=<seasonStartYear of the sale's
match>`) instead of back to whatever `?year=` the form was opened from. That would put
`data.year` on the new sale's season immediately, and decision 6's union-into-`years` logic
would then surface it in the dropdown without further changes. Left for whoever picks this
up to scope properly — it touches the `create` action's redirect target, which is out of
scope for this change.

## Success criteria

1. No sale form — inline or standalone — offers a pass whose `seasonStartYear` differs from
   its match's season, except a pass already allocated to the sale being edited.
2. The wrong-season rule exists in exactly one place: `passesForMatch`. Grepping for
   `seasonStartYear ===` in `web/src/routes/` returns nothing.
3. "+ New sale" is offered exactly for the current season and any season the backend is
   already serving matches for (`seasonYear === null || seasonYear >= currentSeason`,
   computed server-side), and hidden with a "past season" message otherwise — not the
   originally-drafted "`/sales?year=<Y>&new=1` lists season `Y`'s matches", which was
   reverted (see decision 3).
4. The Import CSV modal still lists passes from every season, grouped, with the
   "Previous seasons" group populated.
5. `npm run check` and `npm run typecheck` pass in `web/`; `npm run typecheck`, `npm run
   lint`, `npm run lint:deps`, `npm test` pass at the repo root.
6. No file under `src/` is modified.
