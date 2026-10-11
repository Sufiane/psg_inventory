# PSG-47: loadMatches cache cleanup must not mask the sync error

Base: `main` at 5cc3c80 (includes PSG-45 and PSG-46).

## Problem

`MatchesDb.loadMatches` (`src/db/matches/matches.db.ts`) runs `syncMatches` in `try/catch/finally`. The `finally` runs three cleanup groups serially:

1. `invalidatePattern(matches:*)` - unguarded.
2. `invalidateSalesCachesForMatches(progress.dateChangedMatchIds, syncFailed)` - PSG-45/46 step, with its own `try/catch` that swallows and logs only when `syncFailed`.
3. A loop of two `invalidate` calls per id in `progress.updatedMatchIds` - unguarded.

If (1) or (3) throws while a sync error is propagating, the Redis error replaces the sync error, and the root cause is lost. Because the steps are serial, the first failure also skips every later step, leaving those caches stale for the TTL (1 hour). The guard in (2) protects only that one step and duplicates the `syncFailed` decision locally.

## Goals

- Sync failed: the caller always gets the original sync error; every cleanup failure is logged.
- Sync succeeded: cleanup failures are logged and the first one is rethrown (the admin call must not report success while caches may be stale).
- Every cleanup step is attempted regardless of other steps failing.
- One place decides log-vs-throw (a single guard), not one per step.

## Non-goals

- Changing which keys are invalidated or the `dateChangedMatchIds` logic from PSG-46.
- Retries, domain exceptions (db layer rethrows the raw error), changes to `AdminService`, `createMatch`, or the db interface.

## Design (decision: allSettled over independent steps)

All production changes are in `src/db/matches/matches.db.ts`. The existing `Logger` (`this.logger`) is reused.

**PSG-45's sales step is being refactored as part of this change.** `invalidateSalesCachesForMatches` loses its `syncFailed` parameter and its `try/catch`; it becomes a plain step that throws on failure. The single guard moves to `loadMatches`.

1. `loadMatches` keeps `progress`, `syncFailed`, the `catch { syncFailed = true; throw error; }` and a `finally`. The `finally` body becomes:
   - `const failures = await this.runCleanup(progress);`
   - `this.reportCleanupFailures(failures, syncFailed)`, which logs every failure with `this.logger.error` and, only when `!syncFailed` and failures exist, throws the first one. When sync failed it does not throw, so the in-flight sync error propagates unchanged.
2. New `private async runCleanup(progress: SyncProgress): Promise<unknown[]>`: builds the independent steps in this order, runs them with `Promise.allSettled`, returns the rejection reasons in step order:
   - `this.redisService.invalidatePattern(CACHE_KEYS.invalidateMatches())`
   - `this.invalidateSalesCachesForMatches(progress.dateChangedMatchIds)`
   - for each id in `progress.updatedMatchIds`: `invalidate(CACHE_KEYS.match(id, true))` and `invalidate(CACHE_KEYS.match(id, false))`
3. `invalidateSalesCachesForMatches(matchIds: MatchId[]): Promise<void>`: early return when empty; lookup of distinct owners; then invalidate each owner's sales and accounting patterns via `Promise.all` (all calls start, so one owner failing does not skip the others). No try/catch.
4. Existing why-comments are kept on the code they describe (runs even if sync throws; direct deletes instead of per-id pattern scans). The `SyncProgress` comment mentioning "the `finally` in loadMatches" stays accurate.

Log message shape: one readable line per failure, e.g. `cache cleanup step failed (<sync failed: sync error takes precedence | sync ok: rethrowing first>)`, with the reason passed as the second argument as PSG-45 does today. Exact text is an implementation detail; the tests assert call counts, not strings.

### Behaviour changes to be aware of

- Cleanup steps now run concurrently instead of serially; they touch independent keys. The old test "still invalidates the owners sales cache before them" encoded ordering that no longer exists and is reworded.
- A failing step no longer skips later steps.
- When the sync succeeds and several steps fail, all are logged but only the first (by step order above) is thrown.

### Alternatives considered

- Per-step `try/catch` with a flag (what PSG-45 did): N copies of the same decision, still serial. Rejected.
- Always swallow cleanup errors: hides stale-cache failures on an otherwise successful sync. Rejected.

## Error handling matrix

| Sync | Cleanup | Result |
|---|---|---|
| ok | ok | returns `{ unknownCompetitions }` |
| ok | some fail | all failures logged, first thrown |
| fails | ok | sync error thrown |
| fails | some fail | all failures logged, sync error thrown |

## Testing (tests first)

`src/db/matches/matches.db.spec.ts`, Vitest, `describe` per condition, `it` titles state outcome only. Spy `Logger.prototype.error` (restore in `afterEach`) as the existing lookup-throws tests do.

Existing PSG-45 tests, adjusted but with behaviours kept:
- "when the sales lookup throws / and the sync already failed": still propagates the sync error and logs the lookup error once (now via the shared guard).
- "when the sales lookup throws / and the sync succeeded": still propagates the lookup error; add that it logs it once.
- "when the per-match cache deletes fail": reword "still invalidates the owners sales cache before them" to "still invalidates the owners sales cache" (no ordering claim).

New tests (each a `describe` with condition, sync-fail and sync-ok variants where relevant):
- namespace flush rejects, sync failed: rethrows sync error, still deletes per-match keys and runs the sales step, logs the flush failure.
- namespace flush rejects, sync ok: rejects with the Redis error, other steps still attempted.
- one per-match delete rejects, sync failed / sync ok: sync error (or Redis error) thrown, remaining deletes, flush and sales step still attempted.
- several steps reject, sync ok: all logged (error call count equals failures), first by step order thrown.
- several steps reject, sync failed: all logged, sync error thrown.
- one owner's pattern invalidation rejects: the other owner's patterns are still invalidated.

## Risks and open questions

- Within the sales step, if several owner invalidations fail, only the first rejection is reported by `Promise.all`; the others are not logged individually. Acceptable (they are the same Redis outage in practice); say so if you want each logged.
- "First failure thrown" order is flush, sales step, per-match deletes. Easy to change if a different priority is preferred.
- `docs/tech-debt.md` has no entry for this finding; nothing to update there (tracked as PSG-47).
