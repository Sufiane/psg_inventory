# Calendar-only current season — design

Date: 2026-09-06
Status: approved

## Problem

`MatchesService.getCurrentSeason` (`src/api/matches/matches.service.ts:31-43`) decides what
"the current season" is from **fixture data**, not from the calendar:

```ts
const now = new Date();
const earliestUpcoming = await this.matchsDbService.getEarliestUpcomingMatchDate();
const season = getSeasonBucket(earliestUpcoming ?? now);

const dbResponse = await this.matchsDbService.getMatches(
    { from: now, to: season.end },
    withResult,
);
```

Two separate things are wrong with this, and they compound.

### 1. The backend and the frontend roll over on different clocks

Every other season computation in the system buckets on the calendar — `Aug 1 → Jul 31 UTC`
via `seasonStartYearFromDate` (`src/shared/utils/season.utils.ts`, mirrored in
`web/src/lib/season.ts`). `getCurrentSeason` alone buckets on `earliestUpcoming`, so it can
flip to next season the moment next season's first fixture is scheduled — potentially months
before August.

That divergence is already documented as an unresolved gap. The
`docs/specs/2026-09-06-sale-form-pass-filter-unification-design.md` spec closes with a
"Known follow-up" describing exactly this: a sale can be created against a next-season match
while `SalesService.getCurrentSeasonSales` and the sales screen's season dropdown are both
still on the calendar-current season, so the new sale lands in a season the UI has no option
for and simply disappears. Decision 3 of that spec also had to weaken `canCreate` from `===`
to `>=` purely to work around this, with a comment explaining the two clocks.

Every workaround for the divergence is downstream of one line of code. Delete the divergence
and the workarounds go with it.

### 2. `from: now` makes the Redis cache permanently useless

`MatchesDbService.getMatches` caches under
`CACHE_KEYS.matches(dates.from, dates.to, withResult)` —
`matches:start:<from ISO>:end:<to ISO>:withResult:<bool>`. Because `getCurrentSeason` passes
`from: new Date()`, the key embeds a millisecond-precision timestamp. **Every single request
to `/matches/current-season` produces a unique cache key**, so the one-hour TTL never
produces a hit, and the cache grows a new orphan entry per request. The most-hit match
endpoint in the app (dashboard on every load, plus both sale forms) has been going to
Postgres every time.

### 3. Consequence: a latent cache-invalidation bug that is about to become load-bearing

`MatchesDbService.createMatch` (`src/db/matches/matches.service.ts:224-227`) invalidates:

```ts
CACHE_KEYS.invalidateMatches(new Date(payload.date))
// -> pattern `matches:start:<the match's own kickoff ISO>:*`
```

Cache keys are built from the **query window start**, never from a match's own date, so this
pattern matches nothing. `createMatch`'s invalidation is a no-op today, in every case. It has
gone unnoticed precisely because problem 2 meant there was nothing cached to go stale.

Fixing `getCurrentSeason` makes the key stable, which makes the cache real, which makes this
bug real: create a match via `POST /matches` and it would not appear on the dashboard or in
either sale form for up to an hour. So it has to be fixed in the same change.

## The change

**`getCurrentSeason` becomes a thin wrapper over `getSeasonMatches` for
`seasonStartYearFromDate(new Date())`.** Nothing else. One season definition, one code path,
calendar-only.

The consequence that ripples outward: the endpoint now returns the **whole** season
(`Aug 1 → next Aug 1`, exclusive end) instead of only fixtures from `now` forward. Callers
that relied on the backend having already dropped past matches must do that split
themselves. There are four of them, all in `web/`.

## Decisions

### 1. `getSeasonMatches` takes a `SeasonYear`, not a `string`

Today `IMatchesService.getSeasonMatches(seasonStartYear: string)` takes the raw DTO string
and does `Number(seasonStartYear) as SeasonYear` internally. Both callers that aren't the
controller have to stringify a number to satisfy it — `ask.service.ts:76` literally calls
`getSeasonMatches(String(seasonStartYear), true)` on a `SeasonYear` it already has.

The thin wrapper would be a third: `getSeasonMatches(String(seasonStartYearFromDate(new Date())))`.
Three round trips through a string for no reason.

So the signature becomes `getSeasonMatches(seasonStartYear: SeasonYear, withResult?: boolean)`.
The `@Matches(/^\d{4}$/)` DTO validation stays exactly where it is; the controller does the
one coercion at the HTTP boundary, which is where a string-shaped route param should stop
being a string.

### 2. `getCurrentSeason` implementation

```ts
async getCurrentSeason(withResult: boolean = false): Promise<FormattedMatch[]> {
    const matches = await this.getSeasonMatches(
        seasonStartYearFromDate(new Date()),
        withResult,
    );

    return matches.map((match) => formatMatch(match, withResult));
}
```

It keeps returning `FormattedMatch[]` (the controller formats `getSeasonMatches`'s raw
`Match[]` itself; `getCurrentSeason` has always formatted internally). The response shape on
the wire is unchanged — same objects, just more of them.

Two things fall out for free:

- `/matches/current-season` and `/matches/season/<current year>` now hit the **same** Redis
  key, so they share one cache entry instead of two.
- `getSeasonBucket` is no longer called from `matches.service.ts`. It stays in
  `season.utils.ts` — `getCurrentSeasonDate` still uses it.

### 3. `getEarliestUpcomingMatchDate` is deleted, not left orphaned

It has exactly one caller, and this change removes it. It goes from:

- `src/db/matches/matches.service.ts:66-74` (the implementation)
- `src/db/matches/matches.db.interface.ts:14` (the abstract method)
- `src/api/matches/matches.service.spec.ts:79,100` (the mocks in the rewritten tests)

Leaving an unused DB method around invites someone to reintroduce the fixture-based clock.

### 4. `createMatch` invalidates unscoped `matches:*`

```ts
// before
await this.redisService.invalidatePattern(
    CACHE_KEYS.invalidateMatches(new Date(payload.date)),
);

// after
await this.redisService.invalidatePattern(CACHE_KEYS.invalidateMatches());
```

Matching what `loadMatches` (`matches.service.ts:176`) already does. The scoped form cannot
be made correct without either indexing the cache by match date (it isn't) or computing
which windows contain the date (there is one window shape in practice — the season). Blowing
the whole `matches:*` namespace is correct, cheap, and rare: `createMatch` is an admin
action, not a hot path.

With no caller left passing `from`, **the optional parameter is deleted from
`CACHE_KEYS.invalidateMatches` entirely**:

```ts
invalidateMatches: (): CacheKeyPattern => 'matches:*' as CacheKeyPattern,
```

A key-builder that produces patterns matching nothing is a trap, not an API.

**Correction (post-implementation):** the sentence that used to stand here claimed this
change does not touch `CACHE_KEYS.match(matchId)`. That held only for the version of this
change described above — a later round, closing a real cache-poisoning bug in `getOneMatch`,
did touch it. `CACHE_KEYS.match` now takes a `withResult` flag and produces a distinct key
per `(matchId, withResult)` pair. `createMatch` still has nothing to invalidate at that key
(a newly created match has no existing `match:id:*` entry), but `loadMatches` — which can
update matches that already have cached entries — now deletes the affected match's own two
cache keys (`RedisService.invalidate(CACHE_KEYS.match(id, true))` and `...(id, false)`)
alongside the season-wide flush, instead of relying on the season flush alone. Both are direct
key deletes, not a pattern scan — `CACHE_KEYS.match` only ever has two shapes per id, so there
was nothing to gain from scanning for them. The sync loop is extracted into a private
`syncMatches` and wrapped in `try/finally`, so a match already committed before a mid-sync
failure still gets its cache invalidated and the season-wide flush still runs, while the
original error still propagates to the caller.

### 5. A shared `splitByKickoff` in `web/src/lib/matches.ts`

Four frontend surfaces need "which of these have kicked off". Two already carry hand-written
copies of the rule; the other two are about to need it. Same shape as the
`web/src/lib/sale-passes.ts` extraction from earlier today: one rule, one implementation,
four call sites.

```ts
export function splitByKickoff<T extends { date: string }>(
    matches: readonly T[],
    now: Date,
): { upcoming: T[]; past: T[] };
```

- **`upcoming`**: `new Date(match.date).getTime() >= now.getTime()`, input order preserved.
  Both match endpoints return `date asc`, so upcoming comes out earliest-first — which is
  what all four call sites want.
- **`past`**: the complement, sorted **descending** (most recent first). Only the matches
  page renders `past` today, and descending is what it already sorts to; putting the sort in
  the helper means the contract is the same everywhere rather than "sorted if you remember".
- `now` is a **required** parameter, not defaulted. Every call site is then explicit about
  its clock, and the function is trivially testable without fake timers — which matters
  because it is about to be the single point of failure for four screens.
- Generic over `{ date: string }` rather than importing `FormattedMatch`. Keeps
  `web/src/lib/matches.ts` a pure primitive module with no domain-type imports, the same
  rule `web/src/lib/season.ts` follows.
- Pure, non-mutating, isomorphic — so the same function serves a `+page.server.ts` `load`
  and a `{@const}` in a streamed `{:then}` block.

**Boundary:** a match kicking off at exactly `now` counts as upcoming. That matches both
existing inline copies (`>= now`), so no visible behaviour changes at the boundary.

### 6. Where each of the four call sites does the split

| Surface | Where | Why there |
|---|---|---|
| `/sales/new` | `+page.server.ts` `load` | Already has a server load; splitting there keeps the picker correct with JS disabled and leaves the component's script untouched. |
| `/sales?new=1` | `+page.server.ts` `load` | Same, inside the existing `if (isNew && !editId && canCreate)` branch. |
| `/matches` | `+page.server.ts` `load` | Already filters server-side by venue/competition; returning `{ upcoming, past }` instead of `matches` removes two `$derived.by` blocks from the component and makes the SSR HTML correct. |
| `/dashboard` | `+page.svelte`, in the `{:then}` block | Its `matches` is a **streamed** promise deliberately left unawaited in `load`. Awaiting it to split server-side would kill the streaming and delay the page shell. It stays a `{@const}`. |

### 7. Empty-state copy, verbatim

Because the payload now includes past matches, "the list is empty" and "nothing is upcoming"
stop being the same condition. Each surface gets the distinction it actually needs.

**`/dashboard` — "Upcoming matches" card** (`web/src/routes/(app)/dashboard/+page.svelte`):

| Condition | Copy |
|---|---|
| `matches.length === 0` | `No fixtures for this season yet.` |
| `upcoming.length === 0` (season has matches) | `No upcoming matches left this season.` plus a `See the season's results` link to `/matches` |

Today both cases render `No upcoming matches.`, which in mid-July reads as "the app is
broken" rather than "the season finished".

**Correction (post-implementation):** the shipped empty state for the second row is not a
bare sentence — it links to `/matches` via `See the season's results`, added to the table
above. It was missing from this doc.

**`/matches`** (`web/src/routes/(app)/matches/+page.svelte`):

| Condition | Copy |
|---|---|
| `data.totalCount === 0` | `No matches for this season yet.` |
| filters removed everything (`totalCount > 0`, nothing left) | `No matches match these filters.` plus a `Clear filters` link (preserves `?year=`, drops venue/competition) |
| current/future season, nothing upcoming | `No upcoming matches left this season.` |
| past season | *no upcoming block rendered at all* |

**Correction (post-implementation):** the filters-empty row's shipped copy carries a
`Clear filters` link, added to the table above; it was missing from this doc. Separately, the
"nothing upcoming" row as originally shipped could render even when the *season* still had
upcoming matches and only the venue/competition filters excluded them all — `upcoming` is
derived from the filtered list, not the full season. A follow-up cleanup split that row in
two, using a new `totalUpcomingCount` (the unfiltered upcoming count) computed in `load`
alongside the existing `totalCount`/`filteredCount`:

| Condition | Copy |
|---|---|
| current/future season, nothing upcoming, and none was filtered out (`totalUpcomingCount === 0`) | `No upcoming matches left this season.` |
| current/future season, nothing upcoming *after filtering*, but the season still has some (`totalUpcomingCount > 0`) | `No upcoming matches match your filters.` plus a `Clear filters` link |

**Both sale pickers** (`/sales/new` and the `?new=1` inline panel) — rendered in place of the
match `<select>` when `data.matches.length === 0`:

> `No upcoming matches — nothing to log a sale against right now.`

Identical string in both, matching the precedent set by their two pass-fieldset empty states,
which are already word-for-word identical across the two forms.

**Correction (post-implementation):** only that sentence is identical. Each picker appends
its own trailing action, and those deliberately differ: `/sales/new` follows it with a
`Back to sales` link (it is a standalone page — the only way back is a link), while the
`?new=1` inline panel on `/sales` follows it with a `Use Import CSV instead.` button that
opens the import modal in place (it is already on `/sales`, so a "back to sales" link would
be a no-op; steering the user to the actual alternative path — importing a CSV — is the more
useful action there). This doc's "identical string in both" claim is true of the sentence and
was never meant to claim the whole empty state is pixel-identical, but it read that way — this
correction makes the distinction explicit.

### 8. `/matches` page: two fixes this change forces

**a. Past-season gating.** Today `/matches?year=2023` renders `No upcoming matches.` (always
true for a past season — pure noise) and then hides the *entire* season behind a collapsed
`<details>Show 38 past matches</details>`. The whole point of opening a past season is to see
its matches.

`load` computes `isPastSeason = seasonYear !== null && seasonYear < seasonStartYearFromDate(new Date())`.
When true: no upcoming block, and `past` renders as a plain expanded `<ul>` rather than
inside `<details>`. When false, behaviour is as today (upcoming list, then a collapsed
disclosure for anything already played).

This becomes newly relevant in both directions: the current-season view will start showing a
past list (it never could before — the backend filtered them out), and the past-season view
is where the collapsed-everything failure mode already lives.

**b. Unfiltered count for the empty-state distinction.** The template tests
`data.matches.length === 0` and says `No matches match these filters.` — but `data.matches`
is *already* venue/competition-filtered, so an empty season is blamed on filters the user may
not have touched. `load` returns `totalCount` (the pre-filter length) and the template
branches on it per the table in decision 7.

**c. `year` is returned sanitized.** `load` currently returns the raw `Number.parseInt`
result while the fetch path guards with `year && Number.isFinite(year)` — so `?year=abc`
returns `NaN` to the component. `load` now hoists `seasonYear` (the sanitized value) and
returns *that* as `year`, mirroring the round-2 correction already applied to
`web/src/routes/(app)/sales/+page.server.ts`. Required anyway: `isPastSeason` cannot be
computed from a possibly-`NaN` value.

**d. Row markup is extracted to a snippet.** The `<li>` for a match is currently duplicated
between the upcoming list and the past list. After decision 8a there are three render sites.
It becomes a `{#snippet matchRow(match)}` used by all three.

### 9. `canCreate` tightens from `>=` to `===`

`web/src/routes/(app)/sales/+page.server.ts:41-42`:

```ts
// before
const canCreate = seasonYear === null || seasonYear >= seasonStartYearFromDate(new Date());

// after
const canCreate = seasonYear === null || seasonYear === seasonStartYearFromDate(new Date());
```

The `>=` existed for exactly one reason, stated in the comment above it: the backend's
current-season bucketing could roll over ahead of the calendar, so a future `seasonYear`
might be a season the backend was already serving. That is no longer possible — after this
change both sides derive the season from `seasonStartYearFromDate(new Date())`, the same
function on the same clock.

`>=` is now actively wrong: with `?year=2030`, `canCreate` is true, the panel opens, and it
fetches `/matches/current-season` — offering *this* season's matches under a 2030 heading.
`===` is the honest test.

The comment above it is rewritten, and so is the mirroring comment at
`web/src/routes/(app)/sales/+page.svelte:192-196`, which repeats the same now-false
rationale. **Both comments must go.** A comment explaining a workaround for a bug that was
just deleted is worse than no comment.

**This closes the "Known follow-up" from
`docs/specs/2026-09-06-sale-form-pass-filter-unification-design.md`** — the "next-season sale
created before the dropdown has an option for it" gap. Both clocks are now Aug 1 UTC, so the
window in which they disagree no longer exists.

### 10. `ask.service.ts` keeps its call, loses its comment

`src/api/ask/ask.service.ts:70-76` carries:

```ts
// getCurrentSeason(true) resolves to future fixtures only (from
// "now" forward), so the played/upcoming split downstream would
// always see an empty `played` array. getSeasonMatches is bounded
// by the season's start date instead, covering matches that have
// already been played this season.
```

Every sentence of that becomes false. The call itself stays as `getSeasonMatches` — it pairs
with the `seasonStartYear` already computed two lines up for `getAmortization`, and being
explicit about the year is better than an implicit "current". Only the comment changes, to a
one-liner noting it shares `seasonStartYear` with the amortization call.

Swapping it to `getCurrentSeason(true)` would also work and would drop the local
`formatMatch` map, but it would make the ask context's season implicit and decouple it from
the amortization year it must agree with. Not worth it.

## Files touched

**Backend (`src/`) — 10 files**

**Correction (post-implementation):** this section originally said "6 files" over a table
that already had 8 rows, and the shipped diff touches 10 — two new spec files
(`src/db/matches/matches.service.spec.ts` and `src/redis/CACHE_KEYS.spec.ts`) were missing
from the table entirely. Both are added below.

| File | Change |
|---|---|
| `src/api/matches/matches.service.ts` | `getCurrentSeason` becomes a thin wrapper over `getSeasonMatches`; `getSeasonMatches` takes `SeasonYear`; drop the `getSeasonBucket` import, add `seasonStartYearFromDate`. |
| `src/api/matches/interfaces/matches.service.interface.ts` | `getSeasonMatches(seasonStartYear: SeasonYear, ...)`. |
| `src/api/matches/matches.controller.ts` | Coerce the validated DTO string once: `Number(seasonStartYear) as SeasonYear`. |
| `src/api/ask/ask.service.ts` | Drop `String(...)`; replace the stale comment. |
| `src/db/matches/matches.service.ts` | Delete `getEarliestUpcomingMatchDate`; `createMatch` invalidates unscoped; sync loop extracted into `syncMatches` and wrapped in `try/finally` so `loadMatches` invalidates both the season namespace and each updated match's own cache keys even on a mid-sync failure (see the correction under Decision 4 above). |
| `src/db/matches/matches.db.interface.ts` | Delete the `getEarliestUpcomingMatchDate` abstract. |
| `src/redis/CACHE_KEYS.ts` | `invalidateMatches` loses its `from?` parameter; `match` gains a `withResult` parameter (cache-poisoning fix for `getOneMatch`, see the correction above). |
| `src/api/matches/matches.service.spec.ts` | Rewrite the `getCurrentSeason` describe; update `getSeasonMatches` calls to pass a number. |
| `src/db/matches/matches.service.spec.ts` | **New.** Covers `createMatch`'s and `loadMatches`'s cache invalidation, including the partial-failure case. |
| `src/redis/CACHE_KEYS.spec.ts` | **New.** Pins `invalidateMatches` and `match`'s key shapes. |

**Frontend (`web/`) — 9 files**

| File | Change |
|---|---|
| `web/src/lib/matches.ts` | **New.** `splitByKickoff`. |
| `web/src/lib/season.ts` | Add `parseSeasonYearParam(url)` — see the correction note below. |
| `web/src/routes/(app)/matches/+page.server.ts` | Sanitized `year`; `totalCount`; `isPastSeason`; return `{ upcoming, past }`. |
| `web/src/routes/(app)/matches/+page.svelte` | `matchRow` snippet; three-way empty state; past-season gating; delete both `$derived.by` splits. |
| `web/src/routes/(app)/dashboard/+page.svelte` | `splitByKickoff` in the `{:then}` block; two-way empty state. |
| `web/src/routes/(app)/sales/new/+page.server.ts` | Split in `load`, return upcoming only. |
| `web/src/routes/(app)/sales/new/+page.svelte` | Empty-state message in place of the `<select>`. |
| `web/src/routes/(app)/sales/+page.server.ts` | `canCreate` `>=` → `===`; rewrite its comment; split in `load`. |
| `web/src/routes/(app)/sales/+page.svelte` | Empty-state message in the inline new panel; rewrite the stale `isNew` comment. |

Deliberately **unchanged**: `src/shared/utils/season.utils.ts` (`getSeasonBucket` /
`getCurrentSeasonDate` both still used); `web/src/lib/sale-passes.ts`; `ImportSalesModal.svelte`;
every accounting/sales/season-passes service.

**Correction (post-implementation):** `web/src/lib/season.ts` was listed above as unchanged.
It was not — a later round added `parseSeasonYearParam(url)` to that exact file: it reads and
sanitizes the `?year=` query param (shared by every page that accepts a season-start-year
filter), returning `null` for anything missing, non-numeric, or outside the 4-digit range the
backend's `/^\d{4}$/` route validation accepts. `web/src/routes/(app)/matches/+page.server.ts`
now calls it instead of hand-rolling the same `Number.parseInt` + `Number.isFinite` sanitizing
inline, mirroring the equivalent fix already applied to the sales screen.

## Behaviour after the change

| Situation | Before | After |
|---|---|---|
| `GET /matches/current-season` in Jan, next season's fixtures already published | Returns *next* season's fixtures | Returns *this* season's, calendar-correct |
| `GET /matches/current-season` payload | Fixtures from now → season end | The whole season, `Aug 1 → next Aug 1` |
| Redis key for that endpoint | Unique per request; 0% hit rate | `matches:start:<Aug 1>:end:<next Aug 1>:withResult:<bool>`; shared with `/matches/season/<year>` |
| `POST /matches` then reload the dashboard | New match appears (nothing was cached) | New match appears (`matches:*` flushed) |
| Dashboard "Upcoming matches" | Up to 5 upcoming | Identical — split moved client-side |
| Dashboard in mid-July, season over | `No upcoming matches.` | `No upcoming matches left this season.` |
| `/matches` current season, mid-season | Only future fixtures listed | Future fixtures, plus a collapsed "Show N past matches" |
| `/matches?year=2023` | `No upcoming matches.` + everything collapsed | Full season listed, expanded, no upcoming block |
| `/matches?competition=UCL` on an empty season | `No matches match these filters.` | `No matches for this season yet.` |
| Sale picker match `<select>` | Upcoming only (backend-filtered); could show *next* season's fixtures early if already published — `getCurrentSeason` rolled over on the earliest fixture, not the calendar | Upcoming only (frontend-filtered), calendar-locked to Aug 1 — during that same rollover window it now shows the season-ended empty state instead, **not** an identical list (see trade-off below) |
| Sale picker with no upcoming matches | Empty `<select>` with only the placeholder | `No upcoming matches — nothing to log a sale against right now.` |
| `/sales/new?matchId=<past match>` | Match absent, no selection | Match absent, no selection — unchanged |
| `/sales?year=2030` | "+ New sale" offered, lists *current* season's matches | "+ New sale" hidden, past-season message |
| Next-season sale disappearing from the dropdown | Possible (documented follow-up) | Impossible — both clocks are Aug 1 UTC |

## Tradeoff accepted: a rollover-window gap in the sale picker

During the narrow window where a season's last match has already been played but the
calendar has not yet crossed into August 1, **if** next season's fixtures already exist in
the DB, the *old* fixture-based `getCurrentSeason` could roll over early and already show
those next-season fixtures in the sale picker. The *new* calendar-based `getCurrentSeason`
won't show them until Aug 1 — so during that same window, the picker now renders the
season-ended empty state (`No upcoming matches — nothing to log a sale against right now.`)
instead of "an identical list," contrary to what the behaviour table above claimed in an
earlier draft.

This is the flip side of decision 9's fix: closing the "Known follow-up" from
`docs/specs/2026-09-06-sale-form-pass-filter-unification-design.md` (a next-season sale
silently disappearing from the sales dropdown because the two clocks disagreed) opens this
smaller, narrower gap instead (the picker briefly shows nothing rather than showing early).
Accepted on purpose — an honest "nothing to sell yet" empty state beats letting someone
create a sale against a season the rest of the UI (the sales dropdown, `canCreate`) can't yet
see, which is exactly the bug decision 9 just closed.

## Tradeoff accepted: a larger response

`/matches/current-season?withResult=true` grows from "remaining fixtures" to a full ~40-60
match season — a few tens of KB at worst. Accepted because:

- it is now genuinely cached (it never was), so the marginal DB cost goes *down*, not up;
- the dashboard already streams this response, so it never blocks the page shell;
- the alternative — a second `?from=now` endpoint — reintroduces the unstable cache key this
  change exists to remove.

## Verification

`web/` still has no test runner. Backend verification is the existing Jest suite plus
`typecheck`/`lint`/`lint:deps` at the repo root; frontend verification is `npm run check`
and `npm run typecheck` in `web/`, plus the manual browser script in the plan.

**Named follow-up, deferred (restating the one from the 2026-09-06 sale-form spec, now with
one more function behind it): add vitest to `web/`, covering `seasonStartYearFromDate`,
`seasonLabel`, `passesForMatch` and `splitByKickoff`, and wire `web` typecheck + tests into
CI.** `splitByKickoff` is the second pure, table-testable, four-call-site helper extracted in
as many days — the case for a `web/` test runner is now stronger than the case for another
round of manual clicking. Out of scope here, consistent with how the earlier fixes were
handled today.

## Flagged, deliberately out of scope

**`/matches`'s season dropdown offers calendar years, not season years.**
`web/src/routes/(app)/matches/+page.svelte:7-8` seeds from `new Date().getFullYear()`, and
its `<option>` labels are bare years. This is the *identical* bug fixed for the sales screen
in decision 6 of `docs/specs/2026-09-06-sale-form-pass-filter-unification-design.md`: between
January and July it offers a season that has not started, and the same-looking number
silently means a different season for eight months of the year. It also has a mild
interaction with decision 8a — a Jan-to-July pick of `currentYear` selects a *future* season,
so `isPastSeason` is false and the page reads `No matches for this season yet.`

It is not fixed here, on purpose: this change is about one season definition on the backend
and its four frontend consequences, and the dropdown fix drags in `seasonLabel`, the
union-stale-`?year=` logic, and a UX copy change that deserves its own review. Recommended as
the next small piece of work on this screen.

## Success criteria

1. `MatchesService.getCurrentSeason` contains no reference to `earliestUpcoming`, and
   `grep -rn "getEarliestUpcomingMatchDate" src/` returns nothing.
2. `getCurrentSeason()` and `getSeasonMatches(seasonStartYearFromDate(new Date()))` request
   the same window from the DB layer and therefore the same Redis key.
3. Two consecutive `GET /matches/current-season` requests produce one Redis key, not two.
4. `POST /matches` flushes `matches:*`, and the new match is visible on the next dashboard
   load without waiting for a TTL.
5. `CACHE_KEYS.invalidateMatches` takes no arguments.
6. The kickoff split exists in exactly one place: `grep -rn "new Date(match.date)" web/src/routes/`
   returns nothing.
7. Neither sale picker ever lists a match whose kickoff has passed.
8. `/matches?year=<past season>` renders the full season expanded with no "upcoming" block.
9. Neither the `>=`-rationale comment in `web/src/routes/(app)/sales/+page.server.ts` nor its
   twin in `+page.svelte` survives.
10. `npm run typecheck`, `npm run lint`, `npm run lint:deps`, `npm test` pass at the repo
    root; `npm run check` and `npm run typecheck` pass in `web/`.
