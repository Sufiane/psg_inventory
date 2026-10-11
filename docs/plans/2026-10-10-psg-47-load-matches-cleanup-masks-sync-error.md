# PSG-47 loadMatches cleanup masking: implementation plan

Spec: `docs/specs/2026-10-10-psg-47-load-matches-cleanup-masks-sync-error-design.md`

Backend only. Files: `src/db/matches/matches.db.ts`, `src/db/matches/matches.db.spec.ts`. Base is `main` at 5cc3c80 (PSG-45/46 already present).

Conventions: explicit return types, no inline `if`, blank line before `if`/`for`/`return`/`throw`, no single-letter names, no new comments, conventional commit (`fix(matches): ...`), stage and stop (user runs /crit). Move Linear PSG-47 to In Progress first.

## Task 1: tests first (red)

In `src/db/matches/matches.db.spec.ts` inside `describe('loadMatches')`. Reuse `mockTransaction(existingId, previousDate)` for sync-ok cases and the call-count-2 rejecting `$transaction` pattern (from the existing "sales lookup throws / sync already failed" block) for sync-failed cases. Use `vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)` with `mockRestore` in `afterEach`.

1. Adjust existing tests (keep behaviours):
   - "when the per-match cache deletes fail": rename the `it` to `still invalidates the owners sales cache`.
   - "when the sales lookup throws / and the sync succeeded": keep "propagates the lookup error"; add `it('logs the lookup error')` expecting `errorSpy` called once.
   - "and the sync already failed": unchanged (sync error propagates, error logged once).
2. Add new `describe`s:
   - `when the namespace flush rejects` with `and the sync already failed` (rejects with `db exploded`; `invalidate` still called for both per-match keys; sales lookup still called with changed ids; error logged once) and `and the sync succeeded` (rejects with `redis down`; per-match deletes and sales step still attempted).
   - `when one per-match delete rejects` with the same two sub-describes (`invalidate.mockRejectedValueOnce`): other `invalidate` call, flush and sales lookup still happen; correct error thrown.
   - `when several cleanup steps reject` with `and the sync succeeded` (flush rejects with `flush down`, sales lookup rejects with `lookup down`; rejects with `flush down`; `errorSpy` called twice) and `and the sync already failed` (rejects with `db exploded`; `errorSpy` called twice).
   - `when one owner's pattern invalidation rejects`: two owners; make `invalidatePattern` reject for the first owner's sales pattern only; the second owner's sales and accounting patterns are still invalidated.

Run `npx vitest run src/db/matches/matches.db.spec.ts`. Expect the new masking and "still attempted" tests to fail on current code and the adjusted existing ones to pass or fail only for the added log assertion.

## Task 2: implement

In `src/db/matches/matches.db.ts` (Logger already present):

1. `invalidateSalesCachesForMatches(matchIds: MatchId[]): Promise<void>`: drop the `syncFailed` parameter and the `try/catch`/`logger.error` block. Keep the early return for empty ids and the lookup. Replace the sequential owner loop with `await Promise.all(owners.flatMap(owner => [invalidatePattern(invalidateSales(userId)), invalidatePattern(invalidateAccounting(userId))]))` (cast `owner.userId as UserId` at the db boundary as today).
2. Add `private async runCleanup(progress: SyncProgress): Promise<unknown[]>`: steps array in order flush, sales step, then two `invalidate` calls per `progress.updatedMatchIds` id; `Promise.allSettled`; return `reason` of each rejected result. Keep the direct-deletes comment next to the per-match steps.
3. Add `private reportCleanupFailures(failures: unknown[], syncFailed: boolean): void`: `logger.error` once per failure; then, if `!syncFailed` and `failures.length > 0`, `throw failures[0]`. Avoid double negation style issues (`syncFailed === false` is fine if lint prefers).
4. `loadMatches`: keep `progress`, `syncFailed`, the `catch` that sets the flag and rethrows; make the `finally` call `const failures = await this.runCleanup(progress); this.reportCleanupFailures(failures, syncFailed);`. Keep the "runs even if a mid-loop transaction throws" comment. Remove the old serial calls.
5. Do not touch `createMatch`, the interface, `AdminService`.

Run the spec: everything green.

## Task 3: verify

- `npx vitest run src/db/matches src/api/admin`
- `npm run lint`, `npm run build`, then `test -f dist/main.js`.
- `git diff --stat`: only the two files changed.

## Task 4: hand-off

Stage, do not commit; tell the user it is staged for `/crit`. Branch must be `psg-47` before first push (current: `bamako/psg-47-handle`); never rename after a PR exists. Move Linear PSG-47 to In Review only once staged.
