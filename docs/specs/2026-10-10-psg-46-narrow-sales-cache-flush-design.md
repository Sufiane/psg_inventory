# PSG-46: narrow post-sync sales cache flush to matches whose date changed

## Problem

PSG-45 made `MatchesDb.loadMatches` flush sales + accounting caches for every user owning a
sale on any updated match (`invalidateSalesCachesForMatches`). `syncMatches` treats every
pre-existing fixture as "updated" on each pull, so every user with any sale costs two
full-keyspace SCANs (`invalidatePattern`), sequentially, on every pull, even when nothing
about the fixture changed. See `docs/tech-debt.md` item 7.

## Goal

Flush sales/accounting caches only for users owning sales on matches whose `date` actually
changed in this sync. Backend only, one file (`src/db/matches/matches.db.ts`) plus its spec.

## Design

### 1. Capture the old date (no extra query)

`syncMatches` already runs `tx.matches.findFirst({ select: { id: true }, where: ... })` for
the (opponentId, calendar day) dedupe. Change the select to `{ id: true, date: true }`.
The ticket anticipated "one extra select"; none is needed. Cost is one extra column.

### 2. Collect date-changed ids

After the `existing` branch updates the row, push `existing.id` to `updatedMatchIds` as today,
and additionally to `dateChangedMatchIds` when `existing.date.getTime() !== matchDate.getTime()`.

- `updatedMatchIds` keeps its current meaning and its current consumer: the direct
  `CACHE_KEYS.match(id, true|false)` deletes. Those caches embed result/atHome/competition,
  are O(1) deletes, and must stay exhaustive.
- `dateChangedMatchIds` feeds only `invalidateSalesCachesForMatches`.

### 3. Accumulator shape

`syncMatches` keeps mutating caller-owned collections (a mid-loop throw means a return value
is lost; the `finally` in `loadMatches` still needs what accumulated). Two id arrays plus
`unknownCompetitions` makes three out-params, so replace them with one caller-owned object:

```ts
type SyncProgress = {
    updatedMatchIds: MatchId[];
    dateChangedMatchIds: MatchId[];
    unknownCompetitions: string[];
};
```

Private to `matches.db.ts`; `IMatchesDbService` and `LoadMatchesResult` are unchanged.
`loadMatches` creates it, passes it, and in `finally` uses `progress.dateChangedMatchIds` for
the sales step and `progress.updatedMatchIds` for the per-match deletes. The existing
comment explaining why mutation is used moves to the `SyncProgress` type.

### 4. Everything else unchanged

- Early return in `invalidateSalesCachesForMatches` on an empty list (now the common case on
  a no-change pull: zero sales query, zero SCANs).
- `syncFailed` guard, log-and-swallow vs rethrow, distinct-owner lookup, per-user sequential
  flush: untouched. PSG-47 (masking by earlier redis calls in `finally`) stays out of scope.
- Newly inserted matches: not collected anywhere (no sales can exist yet), same as today.

## Decisions needing user judgment

1. **What counts as "changed".** Recommended: `date` only, compared by `getTime()`
   (instants, so timezone-independent; both sides are `Date` after Prisma read and
   `new Date(match.date)`). Caveat: the cached sale list/detail embeds the whole Match
   (`competition`, `atHome`, opponent, possibly result), so a competition or home/away
   correction no longer flushes sale caches and can stay stale up to 1h (ONE_HOUR_TTL). The
   accounting buckets depend on date only. Widening to `competition`/`atHome` is two more
   selected columns and two more comparisons, at the cost of rarely-triggered extra flushes.
   Default here: date only, per the ticket. Say if you want the wider predicate.
2. **Equality semantics.** Millisecond-exact `getTime()`. Sub-second drift from the feed would
   count as a change; football-data returns whole-second ISO strings, so not a concern.
3. **Newly inserted matches.** Excluded (no sales possible). Note the day-level dedupe means
   a TBD-placeholder -> real-kickoff revision is an *update with date change*, which is
   exactly the case that must flush.
4. **Return shape of `syncMatches`.** Stays `Promise<void>` with caller-owned mutable
   `SyncProgress` (recommended; required for throw-safety). Alternative of returning a value
   is rejected because it is lost on a mid-loop throw.
5. **Over-inclusion on rollback.** An id is pushed inside the transaction callback before
   commit; a commit failure leaves a harmless extra flush. Pre-existing behaviour, kept.

## Testing (`src/db/matches/matches.db.spec.ts`, nested `describe` per condition)

`mockTransaction` gains the existing row's date. Cases under `loadMatches`:

- when the existing match date is unchanged: no sales query, no per-user flush; per-match
  key deletes and matches-namespace flush still happen.
- when the existing match date changed: owners looked up by only that id, sales + accounting
  flushed per owner.
- when several fixtures sync and only some changed: lookup `matchId.in` contains only the
  changed ids; per-match deletes cover all updated ids.
- when the match is newly created: no sales query (existing).
- Existing failure cases (lookup throws with sync failed / succeeded, mid-loop throw) are
  updated so their fixtures use a changed date; assertions unchanged.

## Risks

- Stale competition/atHome in cached sales for up to 1h (decision 1).
- Behavioural change is invisible if tests keep `findFirst` returning no `date`; the spec
  fixtures must provide a `Date`.
