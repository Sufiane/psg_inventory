# Season-pass / match-season mismatch on the sale forms — design

Date: 2026-09-04
Status: approved

## Problem

The "Tickets per pass" fieldset on the new-sale and edit-sale pages lists **every** season
pass the user owns, from every season. A sale belongs to the season of its match, so
allocating tickets from a 2023 pass to a 2025 match is nonsense. The backend rejects it,
but only after submit: the user fills the form, hits save, and gets a generic
`SALE_ALLOCATION_PASS_MISMATCH` error with no indication of which row was wrong.

This is a UI bug, not a data-integrity bug. The invariant is already enforced server-side.

## Domain model recap

- `Sales` has **no** season column. A sale's season is derived from its `Match.date`.
- A season runs Aug 1 → Jul 31; `seasonStartYear` is the calendar year of the August.
  Implemented everywhere as `date.getMonth() < 7 ? date.getFullYear() - 1 : date.getFullYear()`.
- `SeasonPasses.seasonStartYear` is an explicit column.
- `SalePassAllocations` links the two. The invariant is:
  `pass.seasonStartYear === seasonStartYearFromDate(sale.Match.date)`.

## Current state

**Backend — already correct.**
`SalesService.validateAllocations()` (`src/api/sales/sales.service.ts`, lines 145-185)
loads the match, buckets `match.date` into a season, and throws
`SALE_ALLOCATION_PASS_MISMATCH` for any allocation whose pass has a different
`seasonStartYear` (or a different owner). It runs on both `addSale` and `updateSale`
(`updateSale` calls it whenever `payload.allocations != null`).

**Frontend — the bug.**
`web/src/routes/(app)/sales/new/+page.server.ts:11` and
`web/src/routes/(app)/sales/[saleId]/+page.server.ts:11` both call `/season-passes`
with no `season` query param. That endpoint returns `findAll` — every pass, every season.
Both `+page.svelte` files then `{#each data.passes}` over the unfiltered list.

**CSV import — structurally safe.**
`validateCommitRows` (`src/api/sales-import/sales-import.resolver.ts:165`) re-resolves each
row's `matchId` from `getHomeMatchesForSeason(passSeason)` and ignores the client-supplied
`row.matchId`. A row that names a match outside the pass season fails to resolve, gets
`error:match-missing`, and `commit()` throws `IMPORT_ROWS_INVALID`. A commit-time
assertion on the pass/match season would be unreachable — it is deliberately **not** added.

**Data.** The `20260607132000_multi_season_passes_and_allocations` backfill is
season-correct, and `validateAllocations` shipped with allocations, so no mismatched rows
can exist through any code path. No repair migration is needed.

## Decisions

### 1. Filter the pass list by the match's season, in the web app

A pass is offered in "Tickets per pass" only when
`pass.seasonStartYear === seasonStartYearFromDate(<the sale's match date>)`.

- **New-sale page:** the match is chosen in the form, so the filter must be reactive.
  Bind the match `<select>` to a `$state` (seeded from the `?matchId=` preset), derive the
  selected match, derive the season, derive the filtered pass list. Before a match is
  picked, render a "Pick a match first" hint in place of the list rather than the
  unfiltered set.
- **Edit-sale page:** the match is fixed and already known in `load` (`sale.Match.date`),
  so the filter is applied **server-side in `+page.server.ts`**. This is a refinement of
  the approved "client-side" decision: the outcome is identical, but it needs no client
  JS and it keeps `+page.svelte` unchanged apart from the pass list it is handed.

Rejected alternatives: (a) refetch `/season-passes?season=<year>` on every match change —
needs a client fetch in an app that is otherwise fully SSR, for data already in hand;
(b) filter server-side on the new-sale page — impossible, the match is not known at load.

### 2. Never silently drop an existing allocation (edit page)

The pass list rendered on the edit page is
`passesForSeason(saleSeason) ∪ passesAlreadyAllocatedOnThisSale`.

If a mismatched allocation ever did exist, hiding its input would silently remove those
tickets on the next save, changing `nbTickets` without the user seeing it. Keeping the row
visible means the user sees and decides. In practice this union is a no-op today.

### 3. Where the season helper lives

New file `web/src/lib/season.ts` exporting `seasonStartYearFromDate(date: Date): SeasonYear`.

`shared/` is types-only (`.d.ts`, no runtime code), so the web app cannot import the
backend helper — a web-local copy is unavoidable. The backend already carries three
copies of this function (`sales`, `accounting`, `season-passes` services); a fourth in
`web/` follows the existing shape rather than inventing a sharing mechanism for this fix.

The helper mirrors the backend exactly, including using **local-time** `getMonth()` /
`getFullYear()`. This has a theoretical edge: a kickoff in the first or last hours of
Aug 1 could bucket differently under a browser TZ than under the server's. No real fixture
falls there, and the backend remains the authority — a wrong client-side bucket surfaces
as the same `SALE_ALLOCATION_PASS_MISMATCH` error users get today.

### 4. No new backend production code

`validateAllocations()` is the correct and only place for this rule. Nothing is added to
it. Test coverage is extended instead (see below).

### 5. Test coverage

- `src/api/sales/sales.service.spec.ts` already pins the mismatch rejection for
  **`addSale`** (`'rejects when the pass belongs to a different season than the match'`).
  The **`updateSale`** path — the one the edit page exercises — has no such test. Add it,
  structured per the project's describe-per-condition convention.
- `src/api/sales-import/sales-import.service.spec.ts` has
  `'re-resolves matchId server-side and rejects a tampered row'`, but it tampers the *date*
  so nothing resolves. Add a distinct case: a row carrying a `matchId` belonging to a
  **different season's** match. It must be rejected with `IMPORT_ROWS_INVALID` and
  `bulkCreate` must not be called. This documents the invariant at the import boundary
  where the unreachable assertion would have gone.

### 6. Web test infra is out of scope

`web/` has no test runner at all — no vitest, no `test` script, and CI does not even run
`web` typecheck. Adding one is a separate change with its own review surface, and this fix
should not wait on it. The FE change ships verified by `npm run check` (svelte-check) plus
the manual browser script in the plan.

**Named follow-up (tracked, not dropped):** *add web unit test infra (vitest) to `web/`,
covering `seasonStartYearFromDate` and other pure FE logic, and wire `web` typecheck +
tests into CI.* The season helper is written as a pure exported function specifically so
it is the first thing that follow-up can test without refactoring.

## Files touched

| File | Change |
|---|---|
| `web/src/lib/season.ts` | New. `seasonStartYearFromDate`. |
| `web/src/routes/(app)/sales/new/+page.svelte` | Bind match select to state; derive season; filter passes; "pick a match first" empty state. |
| `web/src/routes/(app)/sales/[saleId]/+page.server.ts` | Filter loaded passes to the sale's match season, unioned with already-allocated passes. |
| `src/api/sales/sales.service.spec.ts` | Add `updateSale` season-mismatch rejection test. |
| `src/api/sales-import/sales-import.service.spec.ts` | Add foreign-season `matchId` commit rejection test. |

Deliberately **unchanged**: `web/src/routes/(app)/sales/+page.server.ts` (the sales list
loads all passes on purpose — it labels historical allocations across seasons);
`web/src/routes/(app)/sales/new/+page.server.ts` (still loads all passes; the new-sale page
needs the full set client-side to filter as the match changes);
`src/api/sales/sales.service.ts`; `src/api/sales-import/sales-import.resolver.ts`.

## Behaviour after the fix

| Situation | Before | After |
|---|---|---|
| New sale, no match picked | All passes, all seasons | "Pick a match first" hint |
| New sale, match picked | All passes, all seasons | Only that season's passes |
| Edit sale | All passes, all seasons | Only the sale's season's passes (+ any already allocated) |
| User forces a mismatch (JS off, crafted POST) | 400 `SALE_ALLOCATION_PASS_MISMATCH` | Unchanged — backend still rejects |
| CSV import with a foreign-season match | `IMPORT_ROWS_INVALID` | Unchanged, now pinned by a test |

With JS disabled the new-sale filter does not run and the full list renders; the backend
rejection is the fallback, exactly as today. This is accepted, not fixed.

## Success criteria

1. New-sale page shows no pass whose `seasonStartYear` differs from the selected match's season.
2. New-sale page shows a hint, not a pass list, before a match is selected.
3. Edit-sale page shows only same-season passes, plus any pass already allocated to that sale.
4. `npm test` passes, including the two new tests, and both new tests fail if the
   corresponding guard is removed.
5. `npm run typecheck`, `npm run lint`, `npm run lint:deps` pass at repo root; `npm run check`
   passes in `web/`.
6. No production backend file is modified.
