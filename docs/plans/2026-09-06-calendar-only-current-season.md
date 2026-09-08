# Calendar-only current season — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/matches/current-season` derive "the current season" from the calendar (Aug 1 → Jul 31 UTC) instead of from the next scheduled fixture, and update the four frontend surfaces that relied on the endpoint pre-filtering out already-played matches.

**Architecture:** `MatchesService.getCurrentSeason` becomes a thin wrapper over `getSeasonMatches(seasonStartYearFromDate(new Date()))`. That makes the Redis cache key stable for the first time, which makes a pre-existing no-op cache invalidation in `createMatch` load-bearing — fixed in the same pass. The endpoint now returns the whole season, so the "has it kicked off yet" split moves to the frontend as one shared helper, `splitByKickoff`, used by all four consumers.

**Tech Stack:** NestJS 11 + Prisma + Redis (backend, `src/`), SvelteKit 2 + Svelte 5 runes + Tailwind (frontend, `web/`), Jest (backend tests only — `web/` has no test runner).

**Design doc:** `docs/specs/2026-09-06-calendar-only-current-season-design.md`

## Global Constraints

- Explicit return types on every backend function/method, including `Promise<void>`.
- No single-letter variable names except `i`/`j`/`k` in indexed `for` loops. `for (const match of matches)`, `.catch((error) => …)`.
- No inline `if` — always braced, body on its own line.
- Blank line before `if`, `for`, `while`, `return`, `throw` unless it is the first statement in its block.
- Constructor parameter properties are `readonly`.
- Delete dead code rather than commenting it out.
- Jest: nest a `describe` per condition ("when …"); `it` titles state only the outcome.
- `src/` files must never import Prisma outside `src/db/**`.
- Empty-state copy strings are **verbatim** — copy them character-for-character from this plan:
  - `No fixtures for this season yet.`
  - `No upcoming matches left this season.`
  - `No matches for this season yet.`
  - `No matches match these filters.`
  - `No upcoming matches — nothing to log a sale against right now.` (em dash `—`, U+2014)
- Conventional-commit messages (commitlint is enforced via husky).
- Backend tasks touch **only** `src/`. Frontend tasks touch **only** `web/`. No task touches both.

---

## File Structure

**Backend (`src/`)**

| File | Responsibility after this change |
|---|---|
| `src/api/matches/matches.service.ts` | One season definition. `getSeasonMatches(seasonStartYear: SeasonYear, withResult?)`; `getCurrentSeason` delegates to it. |
| `src/api/matches/interfaces/matches.service.interface.ts` | Abstract contract, `SeasonYear` instead of `string`. |
| `src/api/matches/matches.controller.ts` | HTTP boundary; the only place the validated route-param string becomes a number. |
| `src/api/ask/ask.service.ts` | Drops a redundant `String()` and a comment that this change falsifies. |
| `src/db/matches/matches.service.ts` | Data access. Loses `getEarliestUpcomingMatchDate`; `createMatch` invalidates the whole `matches:*` namespace. |
| `src/db/matches/matches.db.interface.ts` | Abstract contract, minus the deleted method. |
| `src/redis/CACHE_KEYS.ts` | `invalidateMatches` takes no arguments. |
| `src/redis/CACHE_KEYS.spec.ts` | **New.** Pins the invariant that the invalidation pattern actually matches the keys the match cache writes. |

**Frontend (`web/`)**

| File | Responsibility after this change |
|---|---|
| `web/src/lib/matches.ts` | **New.** Pure, domain-type-free kickoff split. Sibling of `web/src/lib/season.ts`. |
| `web/src/routes/(app)/matches/+page.server.ts` | Sanitized `year`, `totalCount`, `isPastSeason`, `{ upcoming, past }`. |
| `web/src/routes/(app)/matches/+page.svelte` | One `matchRow` snippet, three-way empty state, past-season gating. |
| `web/src/routes/(app)/dashboard/+page.svelte` | Splits inside the streamed `{:then}` block; two-way empty state. |
| `web/src/routes/(app)/sales/new/+page.server.ts` | Returns upcoming matches only. |
| `web/src/routes/(app)/sales/new/+page.svelte` | Empty-state message in place of the match `<select>`. |
| `web/src/routes/(app)/sales/+page.server.ts` | `canCreate` exact-match; returns upcoming matches only. |
| `web/src/routes/(app)/sales/+page.svelte` | Empty-state message in the inline new panel; stale comment removed. |

---

## Track B — Backend (`src/` only)

### Task B1: `getSeasonMatches` takes a `SeasonYear`

**Files:**
- Modify: `src/api/matches/interfaces/matches.service.interface.ts:6-9`
- Modify: `src/api/matches/matches.service.ts:18-27`
- Modify: `src/api/matches/matches.controller.ts:1-8,22-34`
- Modify: `src/api/ask/ask.service.ts:70-76`
- Test: `src/api/matches/matches.service.spec.ts:30-63`
- Test: `src/api/ask/ask.service.spec.ts:326-342`

**Interfaces:**
- Produces: `IMatchesService.getSeasonMatches(seasonStartYear: SeasonYear, withResult?: boolean): Promise<Match[]>` — Task B2's `getCurrentSeason` calls this with a number.

- [ ] **Step 1: Update the existing tests to pass a number**

In `src/api/matches/matches.service.spec.ts`, replace the whole `describe('getSeasonMatches', …)` block (currently lines 30-63) with:

```ts
    describe('getSeasonMatches', () => {
        describe('when called with a season start year', () => {
            it('queries the exclusive Aug-to-Aug window for that season', async () => {
                const dbResult = [] as Match[];
                matchsDbService.getMatches.mockResolvedValue(dbResult);

                await expect(
                    service.getSeasonMatches(2022 as SeasonYear),
                ).resolves.toEqual(dbResult);

                const window = getSeasonWindow(2022 as SeasonYear, 'exclusive');

                expect(matchsDbService.getMatches).toHaveBeenCalledTimes(1);
                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    { from: window.start, to: window.end },
                    false,
                );
            });

            it('shares the exact Aug 1 UTC boundary with the next season, so the two cannot overlap', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getSeasonMatches(2022 as SeasonYear);

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    expect.objectContaining({
                        to: getSeasonWindow(2023 as SeasonYear, 'exclusive').start,
                    }),
                    false,
                );
            });
        });

        describe('when withResult is true', () => {
            it('forwards the flag to the db layer', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getSeasonMatches(2022 as SeasonYear, true);

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    expect.anything(),
                    true,
                );
            });
        });
    });
```

In `src/api/ask/ask.service.spec.ts`, replace the comment block and assertion at lines 328-342 with:

```ts
        it('fetches matches for the same season year it fetches amortization for', async () => {
            await service.ask(USER_ID, 'anything');

            expect(matches.getSeasonMatches).toHaveBeenCalledWith(2025, true);
        });

        it('does not use getCurrentSeason, keeping the ask window pinned to an explicit year', async () => {
            await service.ask(USER_ID, 'anything');

            expect(matches.getCurrentSeason).not.toHaveBeenCalled();
```

(Leave the rest of that `it` body and the surrounding `describe` exactly as they are — only the comment, the two titles, and the `'2025'` → `2025` argument change.)

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && npx jest src/api/matches/matches.service.spec.ts src/api/ask/ask.service.spec.ts
```

Expected: FAIL. `matches.service.spec.ts` fails to compile (`Argument of type 'number' is not assignable to parameter of type 'string'`), and `ask.service.spec.ts` fails with `Expected: 2025, Received: "2025"`.

- [ ] **Step 3: Change the interface**

`src/api/matches/interfaces/matches.service.interface.ts` — full file:

```ts
import type { MatchId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { Match } from '../../../db/matches/types/match.type';
import { FormattedMatch } from '../types/formatted-match.type';

export abstract class IMatchesService {
    abstract getSeasonMatches(
        seasonStartYear: SeasonYear,
        withResult?: boolean,
    ): Promise<Match[]>;
    abstract getCurrentSeason(withResult?: boolean): Promise<FormattedMatch[]>;
    abstract getMatch(matchId: MatchId, withResult?: boolean): Promise<FormattedMatch>;
}
```

- [ ] **Step 4: Change the service method**

In `src/api/matches/matches.service.ts`, replace the `getSeasonMatches` method (lines 18-27) with:

```ts
    getSeasonMatches(
        seasonStartYear: SeasonYear,
        withResult: boolean = false,
    ): Promise<Match[]> {
        const { start: from, end: to } = getSeasonWindow(seasonStartYear, 'exclusive');

        return this.matchsDbService.getMatches({ from, to }, withResult);
    }
```

The `import type { SeasonYear } from '@psg/shared/time';` at the top is already present — keep it.

- [ ] **Step 5: Coerce once, at the controller**

In `src/api/matches/matches.controller.ts`, add to the imports:

```ts
import type { SeasonYear } from '@psg/shared/time';
```

and replace the `getSeasonMatches` handler with:

```ts
    @Get('/season/:seasonStartYear')
    async getSeasonMatches(
        @Param() { seasonStartYear }: GetSeasonMatchesDto,
        @Query() { withResult }: QueryMatchDto,
    ): Promise<FormattedMatch[]> {
        // GetSeasonMatchesDto has already validated this against /^\d{4}$/.
        const matches = await this.matchesService.getSeasonMatches(
            Number(seasonStartYear) as SeasonYear,
            withResult,
        );

        return matches.map((match) => formatMatch(match, withResult));
    }
```

Do **not** change `GetSeasonMatchesDto` — the `@Matches(/^\d{4}$/)` validation stays on the string.

- [ ] **Step 6: Drop the redundant `String()` in ask**

In `src/api/ask/ask.service.ts`, inside the `Promise.all([...])` at lines 67-78, replace the four-line comment and the call with:

```ts
            // Pinned to the same seasonStartYear as getAmortization above, so
            // the match list and the amortization figures cannot disagree
            // about which season the answer is about.
            this.matchesService.getSeasonMatches(seasonStartYear, true),
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && npx jest src/api/matches/matches.service.spec.ts src/api/ask/ask.service.spec.ts && npm run typecheck
```

Expected: both suites PASS, `tsc --noEmit` exits 0 with no output.

- [ ] **Step 8: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add src/api/matches/interfaces/matches.service.interface.ts src/api/matches/matches.service.ts src/api/matches/matches.controller.ts src/api/matches/matches.service.spec.ts src/api/ask/ask.service.ts src/api/ask/ask.service.spec.ts
git commit -m "refactor(matches): take a SeasonYear in getSeasonMatches, coerce at the controller"
```

---

### Task B2: `getCurrentSeason` becomes calendar-only

**Files:**
- Modify: `src/api/matches/matches.service.ts:1-12,29-43`
- Modify: `src/db/matches/matches.service.ts:66-74` (delete)
- Modify: `src/db/matches/matches.db.interface.ts:14` (delete)
- Test: `src/api/matches/matches.service.spec.ts` (rewrite the `getCurrentSeason` describe)

**Interfaces:**
- Consumes: `getSeasonMatches(seasonStartYear: SeasonYear, withResult?: boolean): Promise<Match[]>` from Task B1.
- Produces: `GET /matches/current-season` returns the whole calendar season (`FormattedMatch[]`, `date asc`, played matches included). Track F depends on this behaviour.

- [ ] **Step 1: Rewrite the `getCurrentSeason` tests**

In `src/api/matches/matches.service.spec.ts`, add these two imports at the top:

```ts
import { Competition } from '@prisma/client';
import { formatMatch } from './formatters/format-match.formatter';
```

Then replace the entire existing `describe('getCurrentSeason', …)` block (lines 65-114) with:

```ts
    describe('getCurrentSeason', () => {
        const playedMatch = {
            id: 'match-id',
            date: new Date('2025-09-13T19:00:00.000Z'),
            atHome: true,
            competition: Competition.CHAMPIONSHIP,
            Opponent: { name: 'Marseille' },
        } as Match;

        afterEach(() => {
            jest.useRealTimers();
        });

        describe('when the calendar date is before August', () => {
            beforeEach(() => {
                jest.useFakeTimers().setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
            });

            it('requests the season that started the previous August', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getCurrentSeason();

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    {
                        from: new Date('2025-08-01T00:00:00.000Z'),
                        to: new Date('2026-08-01T00:00:00.000Z'),
                    },
                    false,
                );
            });

            it('starts the window at the season start, never at the current instant', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getCurrentSeason();

                const [dates] = matchsDbService.getMatches.mock.calls[0];

                expect(dates.from).toEqual(
                    getSeasonWindow(2025 as SeasonYear, 'exclusive').start,
                );
                expect(dates.from).not.toEqual(new Date('2026-07-29T00:00:00.000Z'));
            });
        });

        describe('when the calendar date is exactly the August 1 boundary', () => {
            beforeEach(() => {
                jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
            });

            it('requests the season that starts that August', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getCurrentSeason();

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    {
                        from: new Date('2026-08-01T00:00:00.000Z'),
                        to: new Date('2027-08-01T00:00:00.000Z'),
                    },
                    false,
                );
            });
        });

        describe('when withResult is true', () => {
            beforeEach(() => {
                jest.useFakeTimers().setSystemTime(new Date('2025-09-20T00:00:00.000Z'));
            });

            it('returns formatted matches and forwards the flag', async () => {
                matchsDbService.getMatches.mockResolvedValue([playedMatch]);

                await expect(service.getCurrentSeason(true)).resolves.toEqual([
                    formatMatch(playedMatch, true),
                ]);
                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    expect.anything(),
                    true,
                );
            });

            it('includes matches that have already kicked off', async () => {
                matchsDbService.getMatches.mockResolvedValue([playedMatch]);

                const result = await service.getCurrentSeason(true);

                expect(result).toHaveLength(1);
                expect(result[0].date).toBe('2025-09-13T19:00:00.000Z');
            });
        });

        describe('compared with getSeasonMatches for the same calendar season', () => {
            beforeEach(() => {
                jest.useFakeTimers().setSystemTime(new Date('2025-09-20T00:00:00.000Z'));
            });

            it('requests an identical window, so both share one cache key', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getCurrentSeason();
                await service.getSeasonMatches(2025 as SeasonYear);

                const [currentArgs, seasonArgs] = matchsDbService.getMatches.mock.calls;

                expect(currentArgs).toEqual(seasonArgs);
            });
        });
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && npx jest src/api/matches/matches.service.spec.ts
```

Expected: FAIL. `'requests the season that started the previous August'` reports the received `from` as `2026-07-29T00:00:00.000Z` (the fixture clock's `now`) instead of `2025-08-01T00:00:00.000Z`, and `'includes matches that have already kicked off'` is the same shape of failure.

- [ ] **Step 3: Rewrite `getCurrentSeason`**

In `src/api/matches/matches.service.ts`, replace the whole `getCurrentSeason` method with:

```ts
    async getCurrentSeason(withResult: boolean = false): Promise<FormattedMatch[]> {
        const matches = await this.getSeasonMatches(
            seasonStartYearFromDate(new Date()),
            withResult,
        );

        return matches.map((match) => formatMatch(match, withResult));
    }
```

and change the season-utils import line from:

```ts
import { getSeasonWindow, getSeasonBucket } from '../../shared/utils/season.utils';
```

to:

```ts
import {
    getSeasonWindow,
    seasonStartYearFromDate,
} from '../../shared/utils/season.utils';
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && npx jest src/api/matches/matches.service.spec.ts
```

Expected: PASS, all describes green.

- [ ] **Step 5: Delete the now-orphaned db method**

In `src/db/matches/matches.service.ts`, delete the entire method (lines 66-74):

```ts
    async getEarliestUpcomingMatchDate(): Promise<Date | null> {
        const match = await this.prisma.matches.findFirst({
            select: { date: true },
            where: { date: { gte: new Date() } },
            orderBy: { date: 'asc' },
        });

        return match?.date ?? null;
    }
```

In `src/db/matches/matches.db.interface.ts`, delete line 14:

```ts
    abstract getEarliestUpcomingMatchDate(): Promise<Date | null>;
```

- [ ] **Step 6: Verify nothing references the deleted method**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && grep -rn "getEarliestUpcomingMatchDate" src/ ; echo "exit: $?"
```

Expected: no output, `exit: 1` (grep found nothing).

- [ ] **Step 7: Run the full backend gate**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && npm run typecheck && npm run lint && npm run lint:deps && npm test
```

Expected: all four exit 0. `npm test` reports every suite passing.

- [ ] **Step 8: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add src/api/matches/matches.service.ts src/api/matches/matches.service.spec.ts src/db/matches/matches.service.ts src/db/matches/matches.db.interface.ts
git commit -m "fix(matches): derive the current season from the calendar, not the next fixture"
```

---

### Task B3: make `createMatch`'s cache invalidation actually invalidate

**Files:**
- Modify: `src/redis/CACHE_KEYS.ts:22-23`
- Modify: `src/db/matches/matches.service.ts:224-227`
- Test: `src/redis/CACHE_KEYS.spec.ts` (create)

**Interfaces:**
- Consumes: nothing from B1/B2 at the type level — but this task only *matters* because B2 made the match cache key stable. It can be implemented independently of B1/B2.
- Produces: `CACHE_KEYS.invalidateMatches(): CacheKeyPattern` — zero arguments.

- [ ] **Step 1: Write the failing test**

Create `src/redis/CACHE_KEYS.spec.ts`:

```ts
import CACHE_KEYS from './CACHE_KEYS';

describe('CACHE_KEYS', () => {
    describe('invalidateMatches', () => {
        it('returns the whole matches namespace', () => {
            expect(CACHE_KEYS.invalidateMatches()).toBe('matches:*');
        });

        it('produces a pattern that covers the keys the match cache writes under', () => {
            const key = CACHE_KEYS.matches(
                new Date('2025-08-01T00:00:00.000Z'),
                new Date('2026-08-01T00:00:00.000Z'),
                true,
            );
            const prefix = CACHE_KEYS.invalidateMatches().replace('*', '');

            expect(key.startsWith(prefix)).toBe(true);
        });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && npx jest src/redis/CACHE_KEYS.spec.ts
```

Expected: PASS on the first `it` (the no-arg call already returns `'matches:*'` today) and PASS on the second. **This is the expected starting state** — the bug is not in `CACHE_KEYS` alone, it is in `createMatch` passing an argument that produces a pattern matching nothing. Step 3 makes that call site impossible to express, and the test then locks in the zero-argument contract so nobody reintroduces it.

If you want to see the bug fail first, temporarily add and then delete:

```ts
        it('DELETE ME: the scoped form matches nothing', () => {
            const key = CACHE_KEYS.matches(
                new Date('2025-08-01T00:00:00.000Z'),
                new Date('2026-08-01T00:00:00.000Z'),
                true,
            );
            const scoped = CACHE_KEYS.invalidateMatches(
                new Date('2025-09-13T19:00:00.000Z'),
            ).replace('*', '');

            expect(key.startsWith(scoped)).toBe(true);
        });
```

Expected: FAIL — `Expected: true, Received: false`. Delete this `it` before committing; Step 3 removes the parameter it depends on and it will stop compiling.

- [ ] **Step 3: Drop the parameter from the key builder**

In `src/redis/CACHE_KEYS.ts`, replace lines 22-23:

```ts
    invalidateMatches: (from?: Date): CacheKeyPattern =>
        (from ? `matches:start:${from.toISOString()}:*` : 'matches:*') as CacheKeyPattern,
```

with:

```ts
    // Cache keys are built from the query *window* start (a season boundary),
    // never from a match's own kickoff, so there is no correct narrower
    // pattern to offer. createMatch and loadMatches both flush the namespace.
    invalidateMatches: (): CacheKeyPattern => 'matches:*' as CacheKeyPattern,
```

- [ ] **Step 4: Fix the call site**

In `src/db/matches/matches.service.ts`, in `createMatch`, replace:

```ts
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateMatches(new Date(payload.date)),
        );
```

with:

```ts
        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateMatches());
```

Leave `loadMatches`'s existing `CACHE_KEYS.invalidateMatches()` call untouched — it is already correct.

**Correction (post-implementation):** that last sentence is now false. A later round gave
`loadMatches` per-match cache invalidation on top of its season-wide flush — updated matches
also have their own cache entries invalidated, not just the season-wide `matches:*` pattern —
closing a gap where an updated match's cached `getOneMatch` result could keep serving stale
data for up to the TTL even after the season-wide flush. That work is a parallel,
in-progress cache-invalidation revision as of this writing (targeting a performance issue with
scanning the whole keyspace per updated match), so this note deliberately does not restate its
exact call shape — only the outcome: a match's own cache entries get invalidated when that
match is updated, in addition to the season-wide flush this task adds to `createMatch`.

- [ ] **Step 5: Run the tests and the type check to verify they pass**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && npx jest src/redis/CACHE_KEYS.spec.ts && npm run typecheck && npm run lint
```

Expected: the suite PASSES with 2 tests, `tsc --noEmit` exits 0, eslint exits 0.

- [ ] **Step 6: Verify no caller passes an argument**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && grep -rn "invalidateMatches(" src/
```

Expected: exactly three lines — the definition in `CACHE_KEYS.ts` and two zero-argument call sites in `src/db/matches/matches.service.ts`.

- [ ] **Step 7: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add src/redis/CACHE_KEYS.ts src/redis/CACHE_KEYS.spec.ts src/db/matches/matches.service.ts
git commit -m "fix(matches): flush the whole matches cache namespace when a match is created"
```

---

## Track F — Frontend (`web/` only)

> `web/` has no test runner (no vitest, no `test` script — see the design doc's
> "Verification" section and its named follow-up). Every frontend task's verification is
> `npm run check` + `npm run typecheck` in `web/`, plus the specific manual browser check
> named in the task. Do **not** add a test runner as part of this work.

### Task F1: the shared `splitByKickoff` helper

**Files:**
- Create: `web/src/lib/matches.ts`

**Interfaces:**
- Produces: `splitByKickoff<T extends { date: string }>(matches: readonly T[], now: Date): { upcoming: T[]; past: T[] }` — consumed by Tasks F2, F3 and F4. `now` is **required**, not defaulted.

- [ ] **Step 1: Create the file**

`web/src/lib/matches.ts` — full contents:

```ts
/**
 * Split a match list at `now`.
 *
 * `/matches/current-season` and `/matches/season/:year` both return a whole
 * season, ascending by date and including matches already played, so every
 * screen that wants "what's still to come" has to draw the line itself. This
 * is that line, in one place.
 *
 * `upcoming` preserves the input's ascending order. `past` comes back
 * most-recent-first, which is how it reads on every surface that shows it.
 * A match kicking off at exactly `now` counts as upcoming.
 *
 * Generic over `{ date: string }` rather than importing FormattedMatch, so
 * this stays a pure primitive module like `$lib/season` — and pure, so the
 * same call works in a `+page.server.ts` load and in a browser `$derived`.
 */
export function splitByKickoff<T extends { date: string }>(
    matches: readonly T[],
    now: Date,
): { upcoming: T[]; past: T[] } {
    const cutoff = now.getTime();
    const upcoming: T[] = [];
    const past: T[] = [];

    for (const match of matches) {
        const kickoff = new Date(match.date).getTime();

        if (kickoff >= cutoff) {
            upcoming.push(match);
        } else {
            past.push(match);
        }
    }

    past.sort(
        (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
    );

    return { upcoming, past };
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```

Expected: `svelte-check` reports 0 errors and 0 warnings; `tsc --noEmit` exits 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add web/src/lib/matches.ts
git commit -m "feat(web): add splitByKickoff, the one place a match list is split at kickoff"
```

---

### Task F2: both sale pickers offer upcoming matches only

**Files:**
- Modify: `web/src/routes/(app)/sales/new/+page.server.ts:1-16`
- Modify: `web/src/routes/(app)/sales/new/+page.svelte:46-62`
- Modify: `web/src/routes/(app)/sales/+page.server.ts:1-7,32-52`
- Modify: `web/src/routes/(app)/sales/+page.svelte:191-197,682-700`

**Interfaces:**
- Consumes: `splitByKickoff(matches, now)` from Task F1.
- Produces: `data.matches` on both routes is upcoming-only; `data.canCreate` on `/sales` is now an exact season match.

- [ ] **Step 1: Filter in the standalone new-sale load**

`web/src/routes/(app)/sales/new/+page.server.ts` — add the import and replace the `load`:

```ts
import { splitByKickoff } from '$lib/matches';
```

```ts
export const load: PageServerLoad = async (event) => {
    const [allMatches, passes] = await Promise.all([
        api<FormattedMatch[]>(event, '/matches/current-season'),
        api<SeasonPass[]>(event, '/season-passes'),
    ]);
    const presetMatchId = event.url.searchParams.get('matchId');
    // The endpoint returns the whole calendar season, earliest-first, matches
    // already played included. A sale can only ever be logged against a match
    // that has not kicked off (updateSale's kickoff guard), so the picker only
    // ever offers `upcoming`.
    const { upcoming } = splitByKickoff(allMatches, new Date());

    return { matches: upcoming, presetMatchId, passes };
};
```

Leave the `actions` export in that file completely untouched.

- [ ] **Step 2: Add the standalone empty state**

In `web/src/routes/(app)/sales/new/+page.svelte`, wrap the existing Match `<label>` block (lines 46-62, from `<label class="block">` through its closing `</label>`) so it reads:

```svelte
    {#if data.matches.length === 0}
        <p class="text-sm text-ink-faint">
            No upcoming matches — nothing to log a sale against right now.
        </p>
    {:else}
        <label class="block">
            <span class="text-sm text-ink-muted">Match</span>
            <select
                name="matchId"
                required
                bind:value={selectedMatchId}
                class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
            >
                <option value="">Select a match…</option>
                {#each data.matches as match (match.id)}
                    <option value={match.id}>
                        {dateTime(match.date)}, {match.atHome ? 'vs' : '@'}
                        {match.opponent}
                        ({competitionLabel(match.competition)})
                    </option>
                {/each}
            </select>
        </label>
    {/if}
```

Nothing in the `<script>` block of this file changes.

- [ ] **Step 3: Tighten `canCreate` and filter in the sales-list load**

In `web/src/routes/(app)/sales/+page.server.ts`, add to the imports:

```ts
import { splitByKickoff } from '$lib/matches';
```

Replace the `canCreate` block (the seven-line comment at lines 32-40 plus the assignment) with:

```ts
    // New sales are only ever logged against the current season: updateSale's
    // kickoff guard means a past-season sale could never be marked SOLD, and a
    // future season has no fixtures to offer. `/matches/current-season` derives
    // its season from seasonStartYearFromDate(new Date()) — the same function
    // on the same clock as this line — so an exact match is the honest test.
    // Computed server-side so it runs against the sanitized `seasonYear` rather
    // than the raw `?year=` param.
    const canCreate =
        seasonYear === null || seasonYear === seasonStartYearFromDate(new Date());
```

Replace the match fetch (lines 49-52) with:

```ts
    if (isNew && !editId && canCreate) {
        // The whole calendar season comes back, earliest-first, played matches
        // included — the picker only offers the ones still to kick off.
        const allMatches = await api<FormattedMatch[]>(event, '/matches/current-season');

        matches = splitByKickoff(allMatches, new Date()).upcoming;
    }
```

- [ ] **Step 4: Delete the stale comment in the sales-list component**

In `web/src/routes/(app)/sales/+page.svelte`, replace the five-line comment above `let isNew` (lines 192-196) plus that line with:

```ts
    // `canCreate` is computed server-side against the sanitized season year
    // (see +page.server.ts) — the panel only opens for the current season.
    let isNew = $derived(data.isNew && !editId && data.canCreate);
```

- [ ] **Step 5: Add the inline-panel empty state**

In `web/src/routes/(app)/sales/+page.svelte`, wrap the inline new panel's Match `<label>` (lines 682-700, from `<label class="block sm:col-span-2">` through its closing `</label>`) so it reads:

```svelte
            {#if data.matches.length === 0}
                <p class="sm:col-span-2 text-xs text-ink-faint">
                    No upcoming matches — nothing to log a sale against right now.
                </p>
            {:else}
                <label class="block sm:col-span-2">
                    <span class="text-xs text-ink-muted">Match</span>
                    <select
                        bind:this={newPanelFirstEl}
                        bind:value={newSaleMatchId}
                        name="matchId"
                        required
                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-1.5 text-sm"
                    >
                        <option value="">Select a match…</option>
                        {#each data.matches as match (match.id)}
                            <option value={match.id}>
                                {dateTime(match.date)}, {match.atHome ? 'vs' : '@'}
                                {match.opponent}
                                ({competitionLabel(match.competition)})
                            </option>
                        {/each}
                    </select>
                </label>
            {/if}
```

The string is identical to Step 2's; only the Tailwind type scale differs (`text-xs` here, matching the panel; `text-sm` on the standalone page, matching that form).

Note that `newPanelFirstEl` may now be `null` when there are no matches — the existing focus `$effect` already uses optional chaining (`newPanelFirstEl?.focus()`), so no change is needed there.

- [ ] **Step 6: Verify it type-checks**

```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```

Expected: `svelte-check` reports 0 errors and 0 warnings; `tsc --noEmit` exits 0.

- [ ] **Step 7: Verify the stale rationale is gone**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && grep -rn "earliestUpcoming\|roll over" web/src/
```

Expected: no output.

- [ ] **Step 8: Manual browser check**

Start the backend (`npm run start:dev` at the repo root) and the frontend (`npm run dev` in `web/`), then in the browser:

1. `/sales/new` — the Match dropdown lists only matches whose kickoff is in the future. Compare against `/matches`: no already-played match appears here.
2. `/sales?new=1` — same list, same absences.
3. `/sales?year=<current season year>` — "+ New sale" is offered.
4. `/sales?year=2030` — "+ New sale" is **hidden**, replaced by "Can't add new sales for a past season here — use Import CSV instead." (This is the `>=` → `===` change; before it, the button appeared and the panel listed *this* season's matches.)
5. `/sales?year=2023` — "+ New sale" still hidden, as before.
6. Import CSV modal on `/sales` — still groups passes by season with a populated "Previous seasons" group. Unchanged.

- [ ] **Step 9: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add "web/src/routes/(app)/sales/new/+page.server.ts" "web/src/routes/(app)/sales/new/+page.svelte" "web/src/routes/(app)/sales/+page.server.ts" "web/src/routes/(app)/sales/+page.svelte"
git commit -m "fix(web): offer only upcoming matches in both sale pickers, tighten canCreate"
```

---

### Task F3: dashboard splits in the streamed branch

**Files:**
- Modify: `web/src/routes/(app)/dashboard/+page.svelte:1-12` (imports), `:236-247` (the `{:then matches}` block)

**Interfaces:**
- Consumes: `splitByKickoff(matches, now)` from Task F1.

`web/src/routes/(app)/dashboard/+page.server.ts` is **not** modified. Its `matches` is a deliberately unawaited promise so the page shell renders immediately with skeletons; awaiting it in `load` to split server-side would destroy that.

- [ ] **Step 1: Add the import**

In the `<script lang="ts">` block of `web/src/routes/(app)/dashboard/+page.svelte`, add alongside the other `$lib` imports:

```ts
    import { splitByKickoff } from '$lib/matches';
```

- [ ] **Step 2: Replace the `{:then matches}` block**

Replace from `{:then matches}` down to (but not including) `{:catch err}` in the "Upcoming matches" `<section>` with:

```svelte
    {:then matches}
        {@const upcoming = splitByKickoff(matches, new Date()).upcoming.slice(0, 5)}
        {#if matches.length === 0}
            <p
                in:fade={{ duration: 120, easing: cubicOut }}
                class="text-ink-faint text-sm"
            >
                No fixtures for this season yet.
            </p>
        {:else if upcoming.length === 0}
            <p
                in:fade={{ duration: 120, easing: cubicOut }}
                class="text-ink-faint text-sm"
            >
                No upcoming matches left this season.
            </p>
        {:else}
            <ul
                in:fade={{ duration: 120, easing: cubicOut }}
                class="divide-y divide-line"
            >
                {#each upcoming as match (match.id)}
                    <li>
                        <a
                            href="/matches/{match.id}"
                            class="py-2 flex items-center gap-3 text-sm hover:bg-surface-strong rounded-md px-2 -mx-2 transition-colors"
                        >
                            <span class="w-36 shrink-0 text-ink-muted"
                                >{dateTime(match.date)}</span
                            >
                            <span class="flex-1 min-w-0 text-ink truncate">
                                {match.atHome ? 'vs' : '@'}
                                <strong>{match.opponent}</strong>
                            </span>
                            <span class="text-ink-faint text-xs shrink-0"
                                >{competitionLabel(match.competition)}</span
                            >
                        </a>
                    </li>
                {/each}
            </ul>
        {/if}
```

This deletes the old inline `{@const upcoming = matches.filter((match) => new Date(match.date) >= new Date()).slice(0, 5)}` — that inline copy of the rule is exactly what `splitByKickoff` replaces.

- [ ] **Step 3: Verify it type-checks**

```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```

Expected: `svelte-check` reports 0 errors and 0 warnings; `tsc --noEmit` exits 0.

- [ ] **Step 4: Manual browser check**

1. `/dashboard` — the "Upcoming matches" card shows the same up-to-5 future matches it showed before this change. No already-played match appears.
2. The skeleton still flashes before the list arrives (streaming is intact — the card populates after the page shell, not with it).

- [ ] **Step 5: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add "web/src/routes/(app)/dashboard/+page.svelte"
git commit -m "fix(web): split the dashboard match list with splitByKickoff, distinguish empty states"
```

---

### Task F4: `/matches` — past-season gating, honest empty states, one row snippet

**Files:**
- Modify: `web/src/routes/(app)/matches/+page.server.ts` (whole `load`)
- Modify: `web/src/routes/(app)/matches/+page.svelte` (whole file body)

**Interfaces:**
- Consumes: `splitByKickoff(matches, now)` from Task F1; `seasonStartYearFromDate(date)` from the existing `web/src/lib/season.ts`.
- Produces: `load` returns `{ upcoming: FormattedMatch[]; past: FormattedMatch[]; totalCount: number; year: number | null; venue: Venue; competition: Competition | 'all'; competitions: typeof COMPETITIONS; isPastSeason: boolean }` — note `matches` is **gone** from the returned shape.

- [ ] **Step 1: Rewrite the load**

`web/src/routes/(app)/matches/+page.server.ts` — full file:

```ts
import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import { splitByKickoff } from '$lib/matches';
import { seasonStartYearFromDate } from '$lib/season';
import { COMPETITIONS, type Competition, type FormattedMatch } from '$lib/types';

type Venue = 'both' | 'home' | 'away';

function isCompetition(value: string): value is Competition {
    return (COMPETITIONS as readonly string[]).includes(value);
}

export const load: PageServerLoad = async (event) => {
    const yearParam = event.url.searchParams.get('year');
    const parsed = yearParam ? Number.parseInt(yearParam, 10) : null;
    // `?year=` is a seasonStartYear. Sanitized once here so nothing downstream
    // — including the component's dropdown — ever sees NaN.
    const seasonYear = parsed !== null && Number.isFinite(parsed) ? parsed : null;

    const venueParam = event.url.searchParams.get('venue');
    const venue: Venue =
        venueParam === 'home' || venueParam === 'away' ? venueParam : 'both';

    const competitionParam = event.url.searchParams.get('competition');
    const competition: Competition | 'all' =
        competitionParam && isCompetition(competitionParam) ? competitionParam : 'all';

    const path =
        seasonYear !== null
            ? `/matches/season/${seasonYear}?withResult=true`
            : '/matches/current-season?withResult=true';

    const all = await api<FormattedMatch[]>(event, path);

    const filtered = all.filter((match) => {
        if (venue === 'home' && !match.atHome) {
            return false;
        }

        if (venue === 'away' && match.atHome) {
            return false;
        }

        if (competition !== 'all' && match.competition !== competition) {
            return false;
        }

        return true;
    });

    const { upcoming, past } = splitByKickoff(filtered, new Date());
    // A strictly-past season has nothing upcoming by definition. The page drops
    // the upcoming block entirely for one, and shows the season expanded rather
    // than hiding all of it behind a "show past matches" disclosure.
    const isPastSeason =
        seasonYear !== null && seasonYear < seasonStartYearFromDate(new Date());

    return {
        upcoming,
        past,
        // Pre-filter length, so "this season has no matches" can be told apart
        // from "your filters excluded everything".
        totalCount: all.length,
        year: seasonYear,
        venue,
        competition,
        competitions: COMPETITIONS,
        isPastSeason,
    };
};
```

- [ ] **Step 2: Rewrite the component**

`web/src/routes/(app)/matches/+page.svelte` — full file:

```svelte
<script lang="ts">
    import type { PageData } from './$types';
    import { competitionLabel, dateTime } from '$lib/format';
    import type { FormattedMatch } from '$lib/types';

    let { data }: { data: PageData } = $props();

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

    const venueOptions = [
        { value: 'both', label: 'Both' },
        { value: 'home', label: 'Home' },
        { value: 'away', label: 'Away' },
    ] as const;

    let filteredCount = $derived(data.upcoming.length + data.past.length);
</script>

{#snippet matchRow(match: FormattedMatch)}
    <li class="px-4 py-3 flex items-center gap-3 text-sm">
        <span class="w-32 shrink-0 text-ink-muted">{dateTime(match.date)}</span>
        <span class="flex-1 min-w-0 text-ink truncate">
            {match.atHome ? 'vs' : '@'}
            <strong>{match.opponent}</strong>
        </span>
        <span class="text-ink-faint text-xs w-32 shrink-0"
            >{competitionLabel(match.competition)}</span
        >
        {#if match.result?.score && !match.result.score.includes('null')}
            <span
                class="font-mono text-xs shrink-0 {match.result.isWin
                    ? 'text-positive'
                    : 'text-negative'}"
            >
                {match.result.score}
            </span>
        {/if}
        <a
            href="/matches/{match.id}"
            class="text-primary font-medium hover:text-primary-hover hover:underline shrink-0"
            >View</a
        >
    </li>
{/snippet}

<div class="flex flex-wrap items-end justify-between gap-3 mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Matches</h1>

    <form method="GET" class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
            <label class="text-sm text-ink-muted" for="year">Season</label>
            <select
                id="year"
                name="year"
                class="rounded border border-line-strong bg-surface text-ink-muted px-2 py-1 text-sm hover:text-ink hover:border-ink transition-colors"
                onchange={(event) => event.currentTarget.form?.requestSubmit()}
            >
                <option value="">Current</option>
                {#each years as year (year)}
                    <option value={year} selected={data.year === year}>{year}</option>
                {/each}
            </select>
        </div>

        <div
            class="inline-flex items-center gap-0.5 bg-surface border border-line-strong rounded-md p-0.5"
            role="group"
            aria-label="Venue"
        >
            {#each venueOptions as option (option.value)}
                {@const active = data.venue === option.value}
                <button
                    type="submit"
                    name="venue"
                    value={option.value}
                    aria-pressed={active}
                    class="px-2.5 py-1 text-sm rounded transition-colors duration-150 {active
                        ? 'bg-primary text-surface'
                        : 'text-ink-muted hover:bg-surface-strong hover:text-ink'}"
                >
                    {option.label}
                </button>
            {/each}
        </div>

        <div class="flex items-center gap-2">
            <label class="text-sm text-ink-muted" for="competition">Competition</label>
            <select
                id="competition"
                name="competition"
                class="rounded border border-line-strong bg-surface text-ink-muted px-2 py-1 text-sm hover:text-ink hover:border-ink transition-colors"
                onchange={(event) => event.currentTarget.form?.requestSubmit()}
            >
                <option value="all" selected={data.competition === 'all'}>All</option>
                {#each data.competitions as comp (comp)}
                    <option value={comp} selected={data.competition === comp}>
                        {competitionLabel(comp)}
                    </option>
                {/each}
            </select>
        </div>
    </form>
</div>

{#if data.totalCount === 0}
    <p class="text-ink-faint text-sm">No matches for this season yet.</p>
{:else if filteredCount === 0}
    <p class="text-ink-faint text-sm">No matches match these filters.</p>
{:else}
    {#if !data.isPastSeason}
        {#if data.upcoming.length > 0}
            <ul
                class="bg-surface rounded-lg border border-line divide-y divide-line mb-4"
            >
                {#each data.upcoming as match (match.id)}
                    {@render matchRow(match)}
                {/each}
            </ul>
        {:else}
            <p class="text-ink-faint text-sm mb-4">
                No upcoming matches left this season.
            </p>
        {/if}
    {/if}

    {#if data.past.length > 0}
        {#if data.isPastSeason}
            <ul class="bg-surface rounded-lg border border-line divide-y divide-line">
                {#each data.past as match (match.id)}
                    {@render matchRow(match)}
                {/each}
            </ul>
        {:else}
            <details class="group">
                <summary
                    class="cursor-pointer list-none inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink py-2 transition-colors"
                >
                    <span
                        aria-hidden="true"
                        class="inline-block transition-transform duration-150 group-open:rotate-90"
                        >&rsaquo;</span
                    >
                    Show {data.past.length}
                    {data.past.length === 1 ? 'past match' : 'past matches'}
                </summary>

                <ul
                    class="mt-2 bg-surface rounded-lg border border-line divide-y divide-line"
                >
                    {#each data.past as match (match.id)}
                        {@render matchRow(match)}
                    {/each}
                </ul>
            </details>
        {/if}
    {/if}
{/if}
```

- [ ] **Step 3: Verify it type-checks**

```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```

Expected: `svelte-check` reports 0 errors and 0 warnings; `tsc --noEmit` exits 0. If it reports `Property 'matches' does not exist on type 'PageData'`, you missed a `data.matches` reference — there should be none left in this file.

- [ ] **Step 4: Verify the inline split is gone repo-wide**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && grep -rn "new Date(match.date)" web/src/routes/
```

Expected: no output. The rule now lives only in `web/src/lib/matches.ts`.

- [ ] **Step 5: Manual browser check**

1. `/matches` (current season, mid-season) — upcoming fixtures listed, followed by a collapsed `Show N past matches` disclosure. Before this change the past list never appeared here at all.
2. `/matches?year=2023` — the full season listed in one **expanded** list, most recent first, with **no** "No upcoming matches" line and **no** disclosure wrapper.
3. `/matches?competition=UCL` on a season with no UCL fixtures — reads `No matches match these filters.`
4. `/matches?year=2019` (a season with no data loaded) — reads `No matches for this season yet.`, not the filters message.
5. `/matches?year=abc` — behaves exactly like `/matches` with no `?year=`, and the Season dropdown shows "Current" rather than a blank/NaN selection.
6. Match rows render identically to before in all three positions (date, vs/@, opponent, competition, score chip when present, View link).

- [ ] **Step 6: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add "web/src/routes/(app)/matches/+page.server.ts" "web/src/routes/(app)/matches/+page.svelte"
git commit -m "fix(web): show past seasons expanded and tell an empty season apart from empty filters"
```

---

## Task V: Integration verification (requires Track B and Track F both landed)

**Files:** none modified.

- [ ] **Step 1: Run every gate**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && npm run typecheck && npm run lint && npm run lint:deps && npm test
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```

Expected: all six exit 0.

- [ ] **Step 2: Check the success criteria that are greppable**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
grep -rn "getEarliestUpcomingMatchDate" src/            # expect: nothing
grep -rn "earliestUpcoming" src/ web/src/               # expect: nothing
grep -rn "new Date(match.date)" web/src/routes/         # expect: nothing
grep -rn "invalidateMatches(" src/                      # expect: only zero-arg call sites
```

**Correction (post-implementation):** the last line originally hardcoded "expect: 3 lines,
all zero-arg". That count is stale and brittle — it was accurate only for the state this task
alone produces (the definition plus its two call sites in `src/db/matches/matches.service.ts`),
but subsequent work added more call sites (the new `CACHE_KEYS.spec.ts`, plus
`src/db/matches/matches.service.spec.ts`'s tests for the invalidation behavior), and the file
this pattern greps is under active revision in a parallel cache-invalidation fix as of this
writing. Rather than pin a count that will go stale again, verify the *property* instead: every
matched line calls `invalidateMatches()` with no argument between the parens — there is no
`invalidateMatches(<something>)` call anywhere in `src/`.

- [ ] **Step 3: Verify the cache key is now stable and shared**

With the backend running and Redis reachable:

```bash
redis-cli --scan --pattern 'matches:*'
```

1. Note the current keys. `curl` `/matches/current-season?withResult=true` twice (with a valid auth cookie, or just load `/dashboard` twice in the browser).
2. Re-run the scan. Expected: **one** new key of the form
   `matches:start:<YYYY>-08-01T00:00:00.000Z:end:<YYYY+1>-08-01T00:00:00.000Z:withResult:true`,
   not two. Before this change every request minted its own key.
3. Load `/matches?year=<current season year>`. Expected: **no** additional key — it reuses the one above.

- [ ] **Step 4: Verify `createMatch` invalidation**

1. Load `/dashboard` so the season is cached; confirm the key exists via the scan above.
2. Create a match through the admin surface (`POST /matches`).
3. Re-run `redis-cli --scan --pattern 'matches:*'`. Expected: the key is **gone**.
4. Reload `/dashboard`. Expected: the new match appears immediately, without waiting out the one-hour TTL. (Before this fix the invalidation pattern matched nothing — with a working cache the match would have been invisible for up to an hour.)

- [ ] **Step 5: Cross-surface consistency spot check**

Open `/matches` (current season) and `/sales/new` side by side. Every match in `/sales/new`'s dropdown appears in `/matches`'s **upcoming** list, in the same order, and none of `/matches`'s past list appears in the dropdown.

- [ ] **Step 6: Stage and hand off for review**

```bash
cd /Users/sufianesouissi/Development/psg_inventory && git status
```

Per the repo's git workflow: the work is committed on a branch, not merged. Tell the user it is ready and that they can run `/crit` to review the diff before it lands. Do not open a PR or merge without their go-ahead.

---

## Coordination notes

**Track B and Track F are fully independent at the file level.** No file appears in both tracks — Track B touches only `src/`, Track F only `web/`. They can be built in parallel by separate agents on the same branch with no merge conflicts.

**They must land together.** Track B alone is a regression: `/matches/current-season` would start returning already-played matches and both sale pickers would offer them, letting a user create a sale against a match that has kicked off (which `updateSale`'s kickoff guard then refuses to mark SOLD — a dead-end record). Track F alone is harmless but inert: `splitByKickoff` would filter a list the backend has already filtered.

**If the two ever have to ship separately, ship Track F first.** Filtering an already-filtered list is a no-op; the reverse order is the regression above.

**Within each track, order is fixed:** B1 → B2 → B3 (B3 is technically independent but only *matters* after B2), and F1 → {F2, F3, F4} (F2/F3/F4 are independent of each other once F1 exists and could be split three ways).

**Task V runs last, once, by whoever holds the branch.**

## Self-review notes

- Every spec decision maps to a task: D1/D2 → B1/B2, D3 → B2 Step 5, D4 → B3, D5 → F1, D6 → F2/F3/F4, D7 → the empty-state copy in F2/F3/F4 (verbatim in Global Constraints), D8 → F4, D9 → F2 Steps 3-4, D10 → B1 Step 6.
- The spec's success criteria 1-6 and 9 are greppable and are checked in Task V Step 2 and F2 Step 7 / F4 Step 4; criteria 3-4 are Task V Steps 3-4; criteria 7-8 are the manual scripts in F2 Step 8 and F4 Step 5; criterion 10 is Task V Step 1.
- `splitByKickoff`'s signature is identical in F1's definition and every F2/F3/F4 call site: `splitByKickoff(matches, new Date())`, destructured as `{ upcoming, past }` or read as `.upcoming`.
- The spec's flagged-out-of-scope item (the `/matches` season dropdown seeding from a calendar year) is **not** implemented here. F4 Step 2 deliberately leaves `currentYear`/`years`/the bare-year `<option>` labels exactly as they are.
