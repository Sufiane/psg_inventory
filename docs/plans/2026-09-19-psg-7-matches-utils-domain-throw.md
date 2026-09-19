# Move the `matches.utils.ts` Domain Throw Out of the db Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `convertStringToCompetition` return `Competition | null` instead of throwing a `DomainException`, have `MatchesDb.loadMatches` report unknown competitions as a result value, and have `AdminService.loadMatches` raise `DomainException(ErrorCode.UNKNOWN_COMPETITION)` — preserving the 400 wire contract while moving the domain throw out of the db layer.

**Architecture:** Backend-only. The db layer stops throwing on unknown competitions: `syncMatches` converts before the per-match transaction, skips unmappable matches and records their competition names via an out-param; `loadMatches` returns `{ unknownCompetitions: string[] }`; `AdminService` throws when the list is non-empty. The only deliberate control-flow change (D1 in the spec): valid matches after an unknown one now commit instead of the whole sync aborting mid-loop. The `^src/db/` clause of `no-orm-outside-db` is re-checked and kept (spec D4) — no lint config change.

**Tech Stack:** NestJS 11 + Prisma 6, dependency-cruiser 17 (`no-orm-outside-db`), Jest 29 + ts-jest, jest-mock-extended.

**Spec:** `docs/specs/2026-09-19-psg-7-matches-utils-domain-throw-design.md`. Read D1–D5 before starting — D1 (skip-and-report was ratified; if the coordinator flipped it to abort-and-classify, stop and ask for a revised plan), D2 (exact converter shape), D3 (`LoadMatchesResult` shape and the service raise), D4 (lint clause re-check: no config edit), D5 (test inventory).

## Global Constraints

- **Backend-only.** Nothing under `web/` or `shared/` is touched. `src/shared/types/formatted-match.type.ts` stays as-is (`competition: string`).
- **Mapping table stays byte-identical** — only `'Ligue 1'` → `Competition.CHAMPIONSHIP` and `'UEFA Champions League'` → `Competition.CHAMPIONS_LEAGUE`. Do NOT add `FRENCH_CUP`/`LEAGUE_CUP` or any other line (spec Non-goals). The schema enum's other values are out of scope.
- **`loadMatches`'s `finally` cache-invalidation block must stay exactly as it is today** (`invalidatePattern(CACHE_KEYS.invalidateMatches())` + per-id `invalidate`). Only the return value and the sync loop change.
- **No `.dependency-cruiser.cjs` change and no `package.json` change** (spec D4). `npm run lint:deps` must stay green.
- Repo style (from psg-5 and the codebase): explicit return types including `Promise<LoadMatchesResult>` / `Competition | null`; no single-letter locals; blank line before `if`/`for`/`return`/`throw` unless first in its block; constructor-injected dependencies stay `private readonly` (no constructor changes here).
- **Gate, run at the end of every task:**
  ```bash
  npm run typecheck && npm run lint && npm run lint:deps && npm test
  ```
- **Do not commit.** Stage the changes and report. The user runs `/crit` on the staged diff and gives the go-ahead before anything is committed. There are no `git commit` lines in this plan.

---

## Parallelism

**None. One track, three sequential tasks.** Task 2 must land after Task 1: `admin.service.spec.ts`'s mock shape only compiles against Task 1's new `loadMatches` signature (that is why the one-line mock fix lives in Task 1, not Task 2). Task 1 is green standalone (the old `AdminService` body compiles against the new interface — `await expr;` ignores the return value).

| Task | Depends on |
|---|---|
| 0 — green baseline | nothing |
| 1 — db layer restructure + utils spec + admin spec mock-shape fix + db spec additions | 0 |
| 2 — service raises + admin spec tests + tech-debt cleanup | 1 |

This is a **backend-only** change: nothing under `web/`. No frontend work exists, so there is no backend/frontend parallel split to offer.

---

## File Structure

**Modified (Task 1):**

| File | Change |
|---|---|
| `src/db/matches/matches.utils.ts` | return `Competition | null`; drop `DomainException`/`ErrorCode` imports |
| `src/db/matches/matches.db.interface.ts` | add `LoadMatchesResult`; change `loadMatches` signature |
| `src/db/matches/matches.db.ts` | `syncMatches` converts before the tx, skips nulls via out-param; `loadMatches` returns the result |
| `src/api/admin/admin.service.spec.ts` | one-line mock-shape fix (line 61) — required for typecheck |

**Created (Task 1):** `src/db/matches/matches.utils.spec.ts`

**Modified (Task 2):**

| File | Change |
|---|---|
| `src/api/admin/admin.service.ts` | consume result; warn log; raise `DomainException(UNKNOWN_COMPETITION)` |
| `src/api/admin/admin.service.spec.ts` | add raise/resolve tests |
| `docs/tech-debt.md` | delete entry #3 (done convention) |

**Created (all):** this plan + `docs/specs/2026-09-19-psg-7-matches-utils-domain-throw-design.md` (committed with the change, per house docs convention).

---

### Task 0: Establish a green baseline

`node_modules` is present and the untouched tree was green at planning time (the psg-5 plan measured 25 suites / 290 tests on 2026-09-18; nothing since then adds specs). Re-confirm before editing anything.

- [ ] **Step 1: Run the full gate on the untouched tree**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test
```

- [ ] **Step 2: Report the baseline explicitly**

Report each command as pass/fail with output if any. **If anything is red, stop and escalate — do not start Task 1 on a broken tree.**

### Task 1: Db layer — converter returns null, sync skips and reports

**Files:**
- Modify: `src/db/matches/matches.utils.ts`
- Modify: `src/db/matches/matches.db.interface.ts`
- Modify: `src/db/matches/matches.db.ts` (`syncMatches` ~lines 109-199, `loadMatches` ~lines 80-105)
- Modify: `src/api/admin/admin.service.spec.ts` (line 61 only)
- Create: `src/db/matches/matches.utils.spec.ts`
- Test (extend): `src/db/matches/matches.db.spec.ts` (inside the existing `describe('loadMatches')`, `formattedMatch` fixture at line 31 is in scope)

**Interfaces:**
- Consumes: `FormattedMatch.competition: string` (`src/shared/types/formatted-match.type.ts`) — untouched.
- Produces:
  - `convertStringToCompetition(competition: string): Competition | null` — `null` for any string other than `'Ligue 1'` / `'UEFA Champions League'`. `Competition` stays the runtime import from `@prisma/client`.
  - `export type LoadMatchesResult = { unknownCompetitions: string[] }` exported from `matches.db.interface.ts`.
  - `IMatchesDbService.loadMatches(matches: FormattedMatch[]): Promise<LoadMatchesResult>`.
  - `MatchesDb.loadMatches` returns `{ unknownCompetitions: [...new Set(unknownCompetitions)] }`; `syncMatches(matches, updatedMatchIds, unknownCompetitions)` pushes each skipped `match.competition` string.

- [ ] **Step 1: Write the failing converter spec**

Create `src/db/matches/matches.utils.spec.ts`:

```ts
import { Competition } from '@prisma/client';
import { convertStringToCompetition } from './matches.utils';

describe('convertStringToCompetition', () => {
    it('maps "Ligue 1" to CHAMPIONSHIP', () => {
        expect(convertStringToCompetition('Ligue 1')).toBe(Competition.CHAMPIONSHIP);
    });

    it('maps "UEFA Champions League" to CHAMPIONS_LEAGUE', () => {
        expect(convertStringToCompetition('UEFA Champions League')).toBe(
            Competition.CHAMPIONS_LEAGUE,
        );
    });

    it('returns null for an unknown competition', () => {
        expect(convertStringToCompetition('Coupe de France')).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(convertStringToCompetition('')).toBeNull();
    });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx jest src/db/matches/matches.utils.spec.ts`
Expected: the two null tests FAIL — the current code throws `DomainException` instead of returning `null`. The two mapping tests pass.

- [ ] **Step 3: Implement the converter**

`src/db/matches/matches.utils.ts` — delete the `DomainException` and `ErrorCode` imports, change the return type, and replace the `default:` arm:

```ts
import { Competition } from '@prisma/client';

export function convertStringToCompetition(competition: string): Competition | null {
    switch (competition) {
        case 'Ligue 1':
            return Competition.CHAMPIONSHIP;
        case 'UEFA Champions League':
            return Competition.CHAMPIONS_LEAGUE;
        default:
            return null;
    }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `npx jest src/db/matches/matches.utils.spec.ts`
Expected: 4 PASS.

- [ ] **Step 5: Change the interface contract**

`src/db/matches/matches.db.interface.ts`:

```ts
import { Competition } from '@prisma/client';
import type { MatchId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { FormattedMatch } from '../../shared/types/formatted-match.type';
import { Match } from './types/match.type';

export type LoadMatchesResult = {
    unknownCompetitions: string[];
};

export abstract class IMatchesDbService {
    abstract getMatches(
        dates: { from: Date; to?: Date },
        withResult?: boolean,
    ): Promise<Match[]>;
    abstract getOneMatch(id: MatchId, withResult?: boolean): Promise<Match | null>;
    abstract getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]>;

    abstract loadMatches(matches: FormattedMatch[]): Promise<LoadMatchesResult>;
    abstract createMatch(payload: {
        date: string;
        atHome: boolean;
        opponent: string;
        competition: Competition;
        result?: {
            isWin: boolean;
            score: string;
        };
    }): Promise<void>;
}
```

Only two lines change: the `LoadMatchesResult` type block above the class, and the `loadMatches` signature. Everything else is context.

- [ ] **Step 6: Restructure `loadMatches` and `syncMatches`**

`src/db/matches/matches.db.ts` — `loadMatches` (lines 80-105): declare the out-param, pass it through, return the deduplicated result:

```ts
    async loadMatches(matches: FormattedMatch[]): Promise<LoadMatchesResult> {
        // syncMatches mutates these arrays in place rather than returning one,
        // because if a mid-loop transaction throws, its return value never
        // runs — these arrays are the only way the `finally` block below still
        // sees the ids/unknowns accumulated before the throw.
        const updatedMatchIds: string[] = [];
        const unknownCompetitions: string[] = [];

        try {
            await this.syncMatches(matches, updatedMatchIds, unknownCompetitions);
        } finally {
            // Runs even if a mid-loop transaction throws, so matches
            // committed by earlier iterations never serve stale cache data
            // for the rest of the TTL. (Comment preserved verbatim.)
            await this.redisService.invalidatePattern(CACHE_KEYS.invalidateMatches());

            for (const matchId of updatedMatchIds) {
                await this.redisService.invalidate(CACHE_KEYS.match(matchId, true));
                await this.redisService.invalidate(CACHE_KEYS.match(matchId, false));
            }
        }

        return { unknownCompetitions: [...new Set(unknownCompetitions)] };
    }
```

`syncMatches` (lines 109-199): take the third out-param, convert **before** the per-match transaction, skip nulls. The transaction body (opponent `upsert`, date-window computation, dedupe `findFirst`, `update`/`create`, `updatedMatchIds.push`) is copied from the current file **byte-identical** — the only edits are: (a) add the `unknownCompetitions` parameter, (b) insert the conversion + skip at the loop head, (c) delete the old line 149 (`const competition = convertStringToCompetition(match.competition);`) from inside the transaction so the loop-head `competition` const is the one used by the update/create data blocks below:

```ts
    private async syncMatches(
        matches: FormattedMatch[],
        updatedMatchIds: string[],
        unknownCompetitions: string[],
    ): Promise<void> {
        for (const match of matches) {
            const competition = convertStringToCompetition(match.competition);

            if (competition === null) {
                unknownCompetitions.push(match.competition);

                continue;
            }

            await this.prisma.$transaction(async (tx) => {
                // ... the existing transaction body, unchanged
            });
        }
    }
```

The one import change in this file: `matches.db.ts` line 15 already imports `IMatchesDbService` from `./matches.db.interface`; extend that import to also bring in `LoadMatchesResult`:

```ts
import { IMatchesDbService, LoadMatchesResult } from './matches.db.interface';
```

The `convertStringToCompetition` import (`./matches.utils`) already exists at line 3 and stays.

- [ ] **Step 7: Fix the admin spec mock shape (required for typecheck)**

`src/api/admin/admin.service.spec.ts` line 61 — the new interface makes `undefined` a type error under `mockDeep` typing:

```ts
matchsDbService.loadMatches.mockResolvedValueOnce({ unknownCompetitions: [] });
```

No other change to this file in Task 1.

- [ ] **Step 8: Add the loadMatches unknown-competition tests**

Append a new `describe` inside the existing `describe('loadMatches')` in `src/db/matches/matches.db.spec.ts` (after the `when a mid-loop transaction throws` block, line 166). `formattedMatch` (line 31) and `mockTransaction` (line 38) are in scope. `OpponentName` is already imported at line 9.

```ts
        describe('when a match has an unknown competition', () => {
            const unknownMatch: FormattedMatch = {
                ...formattedMatch,
                competition: 'Coupe de France',
            };

            it('skips the match without opening a transaction and reports the competition', async () => {
                const result = await service.loadMatches([unknownMatch]);

                expect(prismaService.$transaction).not.toHaveBeenCalled();
                expect(result.unknownCompetitions).toEqual(['Coupe de France']);
            });

            it('still syncs valid matches and reports the unknown one', async () => {
                mockTransaction(null);

                const result = await service.loadMatches([
                    formattedMatch,
                    unknownMatch,
                ]);

                expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
                expect(result.unknownCompetitions).toEqual(['Coupe de France']);
            });

            it('deduplicates repeated unknown competitions', async () => {
                mockTransaction(null);

                const secondUnknown: FormattedMatch = {
                    ...unknownMatch,
                    opponent: 'Lyon' as OpponentName,
                };

                const result = await service.loadMatches([
                    unknownMatch,
                    secondUnknown,
                ]);

                expect(prismaService.$transaction).not.toHaveBeenCalled();
                expect(result.unknownCompetitions).toEqual(['Coupe de France']);
            });
        });
```

- [ ] **Step 9: Run the matches specs**

Run: `npx jest src/db/matches/matches.utils.spec.ts src/db/matches/matches.db.spec.ts src/api/admin/admin.service.spec.ts`
Expected: all green — utils (4), db loadMatches (existing 6 + new 3), admin (existing suite with the corrected mock).

- [ ] **Step 10: Run the full gate**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test
```

Expected: all green. `lint:deps` confirms `no-orm-outside-db` still holds with the unchanged `^src/db/` clause (spec D4 — the clause stays; this is the re-check the tech-debt entry asked for).

- [ ] **Step 11: Report Task 1**

Report: "Task 1 staged — converter returns `Competition | null` and no longer throws; `loadMatches` returns `LoadMatchesResult` and skips unknown competitions; utils spec added (4 tests); db spec gained the unknown-competition block (3 tests); admin spec mock shape fixed. Gate green. Not committed."

### Task 2: Admin service raises; tech-debt entry deleted

**Files:**
- Modify: `src/api/admin/admin.service.ts` (`loadMatches` method, lines 27-36)
- Modify: `src/api/admin/admin.service.spec.ts` (add tests to `describe('loadMatches')`, after line 73)
- Modify: `docs/tech-debt.md` (delete entry #3, lines 42-67)

**Interfaces:**
- Consumes: `IMatchesDbService.loadMatches(matches: FormattedMatch[]): Promise<{ unknownCompetitions: string[] }>` from Task 1.
- Produces: `AdminService.loadMatches(seasonStartYear?: number): Promise<void>` — throws `DomainException(ErrorCode.UNKNOWN_COMPETITION)` when `unknownCompetitions` is non-empty; `DomainException`/`ErrorCode` imports already exist (`admin.service.ts:4-5`).

- [ ] **Step 1: Make the service raise**

`src/api/admin/admin.service.ts` — replace the `loadMatches` method body:

```ts
    async loadMatches(seasonStartYear?: number): Promise<void> {
        const psgMatches = await this.footballDataService.getTeamMatches(
            PSG_ID,
            seasonStartYear,
        );

        this.logger.log(`Loading ${psgMatches.length} matches.`);

        const { unknownCompetitions } = await this.matchsDbService.loadMatches(psgMatches);

        if (unknownCompetitions.length > 0) {
            this.logger.warn(
                `Skipped matches in unknown competitions: ${unknownCompetitions.join(', ')}`,
            );

            throw new DomainException(ErrorCode.UNKNOWN_COMPETITION);
        }
    }
```

- [ ] **Step 2: Add the raising tests**

`src/api/admin/admin.service.spec.ts` — the file already imports `DomainException` (line 11); add `ErrorCode` to make the code assertion strong:

```ts
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
```

Add two tests inside `describe('loadMatches')` (after the existing `'should call load matches'` test, line 73), following the file's existing `describe('when …')` + `should …` convention (see `createMatch` / `flushUserCache`):

```ts
        describe('when a match has an unknown competition', () => {
            it('should throw a domain exception', async () => {
                const matches = [] as FormattedMatch[];
                footballDataService.getTeamMatches.mockResolvedValue(matches);
                matchsDbService.loadMatches.mockResolvedValueOnce({
                    unknownCompetitions: ['Coupe de France'],
                });

                const seasonStartYear = 2022;

                await expect(service.loadMatches(seasonStartYear)).rejects.toMatchObject({
                    code: ErrorCode.UNKNOWN_COMPETITION,
                });
            });
        });

        describe('when every competition is known', () => {
            it('should not throw', async () => {
                const matches = [] as FormattedMatch[];
                footballDataService.getTeamMatches.mockResolvedValue(matches);
                matchsDbService.loadMatches.mockResolvedValueOnce({
                    unknownCompetitions: [],
                });

                const seasonStartYear = 2022;

                await expect(service.loadMatches(seasonStartYear)).resolves.toBeUndefined();
            });
        });
```

Assert the error code with `rejects.toMatchObject({ code: ErrorCode.X })` (repo convention — do not assert `name: 'DomainException'`; no spec in this repo does).

- [ ] **Step 3: Run the admin spec**

Run: `npx jest src/api/admin/admin.service.spec.ts`
Expected: all PASS (existing 5 + new 2).

- [ ] **Step 4: Delete tech-debt entry #3**

`docs/tech-debt.md` — remove the whole `## 3. matches.utils.ts throws a domain exception from the db layer` section (lines 42-67 including the trailing `---` separator). Keep entries 2 and 4 with their existing numbers (the file does not renumber — entry #1 was removed the same way by psg-5). The re-check the entry asked for ("re-check whether that clause is still needed") is answered in the spec (D4): the clause stays.

- [ ] **Step 5: Run the full gate**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test
```

Expected: all green. `lint:deps` stays green — no new imports were introduced by Task 2.

- [ ] **Step 6: Stage and report — do not commit**

```bash
git add -A && git status
```

Report: "Task 2 staged — `AdminService.loadMatches` raises `DomainException(UNKNOWN_COMPETITION)` on any unknown competition with a warn log naming them; admin spec gained 2 tests; `docs/tech-debt.md` entry #3 deleted. Gate green. Not committed — ready for `/crit`."

Summary for the report back: both tasks staged, full gate green (repeat the four command results explicitly), no commit made.