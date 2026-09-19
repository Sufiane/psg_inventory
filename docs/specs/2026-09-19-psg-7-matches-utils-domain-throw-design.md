# Move the `matches.utils.ts` Domain Throw Out of the db Layer — Design

**Date:** 2026-09-19
**Status:** Draft — proposed for ratification. One genuine behavioural fork (D1: skip-and-report vs abort-and-classify) is called out for the coordinator to ratify or flip before Task 1 of the plan is executed.
**Type:** Backend-only. One deliberate, documented control-flow change; the wire contract is preserved.
**Tracks:** Linear PSG-7, `docs/tech-debt.md` entry #3.

## Problem

`src/db/matches/matches.utils.ts` throws a `DomainException` from the db layer:

```ts
export function convertStringToCompetition(competition: string): Competition {
    switch (competition) {
        case 'Ligue 1':
            return Competition.CHAMPIONSHIP;
        case 'UEFA Champions League':
            return Competition.CHAMPIONS_LEAGUE;
        default:
            throw new DomainException(ErrorCode.UNKNOWN_COMPETITION);
    }
}
```

The global CLAUDE.md's hexagonal rule puts domain throws in the service layer: "No domain
throws here — return `null`/`undefined` and let the service decide." This change moves the
throw to `AdminService`, the one service that can reach this code path.

The issue is not mechanical (the entry's own size caveat): moving the throw changes control
flow on a path with test coverage built around current behaviour, so the call-site and test
impact are the core of this design. It also carries a second, coupled question from the
entry's "Also note": after the restructure, is `no-orm-outside-db`'s `^src/db/` location
clause still needed? (D4.)

## Goal

- `convertStringToCompetition` returns `Competition | null` and never throws.
- The db layer's `loadMatches` reports unknown competitions as **data**, not as an error.
- `AdminService.loadMatches` raises `DomainException(ErrorCode.UNKNOWN_COMPETITION)`.
- The HTTP wire contract is unchanged: 400 `BadRequestException('unknown_competition')` via
  the existing mapper (`http-exception.mapper.ts:22-23`), whose `ErrorCode` key is untouched.
- Re-check the `^src/db/` clause of `no-orm-outside-db` and record the outcome (D4).
- Delete `docs/tech-debt.md` entry #3 when done.

## Non-goals

- **Extending the competition mapping.** The schema enum has four values
  (`CHAMPIONS_LEAGUE`, `CHAMPIONSHIP`, `FRENCH_CUP`, `LEAGUE_CUP` — `src/prisma/schema.prisma:68-73`);
  the mapping handles two. Whether cup matches should be mapped (or synced at all) is a
  product decision, not a layering refactor. The mapping table stays byte-identical.
- **Making unknown competitions non-fatal.** The issue says "make the calling service
  raise", so `AdminService` keeps raising. Making skips non-fatal is now a one-line option
  the service layer owns — that is the point of the refactor — but flipping it is a
  separate product decision.
- Touching `web/` (wire contract is unchanged, so nothing there can tell the difference).
- Converting the ten type-only Prisma imports under `src/db/` to `import type` (D4).
- Any `package.json` / `.dependency-cruiser.cjs` change (D4 concludes: keep both as-is).

## Baseline (verified during planning, 2026-09-19)

- Single call site for the throw: `MatchesDb.syncMatches` → `loadMatches`
  (`src/db/matches/matches.db.ts:149`, inside the per-match `$transaction`, after the
  opponent upsert). No other file in the repo calls `convertStringToCompetition`
  (repo-wide grep: only `matches.db.ts:3` imports it).
- Single caller of `loadMatches`: `AdminService.loadMatches` (`src/api/admin/admin.service.ts:35`)
  → `AdminController` (`POST admin/matches/load`). `SalesImportService` injects
  `IMatchesDbService` but never calls `loadMatches` (it uses `getHomeMatchesForSeason`);
  `MatchesService` and `SalesService` inject it and never call `loadMatches`. No cron
  touches it (only `cancel-sales` is scheduled).
- **Test coverage of the throw path: none.** No spec anywhere references
  `UNKNOWN_COMPETITION` or asserts the utils throw. What exists is control-flow coverage
  that survives this change: `matches.db.spec.ts` (loadMatches happy path with `'Ligue 1'`
  fixtures; mid-loop transaction-error path asserting `finally` cache invalidation) and
  `admin.service.spec.ts` (asserts `loadMatches` is called with the formatted matches and
  the service resolves `undefined`).
- `Matches.competition` is a **non-nullable** enum column (`schema.prisma:80`) — the db
  layer literally cannot persist a null competition. "Return `null` and let the service
  decide" cannot mean "insert nothing"; it governs the *reporting*, not the insert.
- Real-world relevance: football-data API responses include cup fixtures in a season's
  match list, and the mapping covers only league/CL names — so today one cup fixture in a
  season payload aborts the entire `loadMatches` with 400 after committing only the matches
  that preceded it in the API order.
- Repo conventions: specs `docs/specs/YYYY-MM-DD-<topic>-design.md`, plans
  `docs/plans/YYYY-MM-DD-<topic>.md` (see psg-5 for the closest precedent: a small
  refactor with lint implications, one commit, stage-and-report gate).

## Decisions

### D1 — The fork: skip-and-report (chosen) vs abort-and-classify (rejected)

The hex rule's letter — "return `null`/`undefined` and let the service decide" — and the
issue's own wording ("deciding what the db layer **returns** instead") both point to the db
layer returning the *fact* of an unknown competition as data, with the service deciding it
is fatal. Two candidate shapes:

**Rejected — abort-and-classify.** The converter returns `Competition | null`; `syncMatches`
throws a new typed *non-domain* db error (e.g. `CompetitionMappingError`); `AdminService`
catches it and rethrows `DomainException(UNKNOWN_COMPETITION)`. The interface
(`Promise<void>`) stays, but: (a) the db layer still exercises the abort judgment itself —
only the error class changes, which is cosmetic compliance; (b) a new cross-layer error
class that exactly one service must know about leaks db internals through the token
abstraction; (c) the service depends on implementation detail rather than the interface's
return shape. It also preserves an outcome this design considers a latent bug (below).

**Chosen — skip-and-report.** The converter returns `Competition | null`; `syncMatches`
skips unmappable matches and records their competition names; `loadMatches` returns the
skips as data; `AdminService` raises the `DomainException` when the list is non-empty.

**Deliberate, documented control-flow delta:** today, the first unknown competition aborts
the entire sync mid-loop (matches before it commit; matches after it never do). Under
skip-and-report, every mappable match commits and the unknown ones are skipped, then the
service raises. The 400 on the wire, the error code, and the cache-invalidation behaviour
(`finally` still flushes the namespace) are all unchanged; the final DB state converges to
the same target. The delta is exactly: *valid matches after the first unknown one now
commit*. This also fixes the latent failure mode above (a single cup fixture no longer
blocks the whole season from syncing) — the refactor is the natural moment for that
control-flow wart, since the wire contract is preserved either way. If the coordinator
wants the abort semantics preserved byte-for-byte, flip to abort-and-classify; everything
else in this design (D2–D5) is unaffected by that choice.

### D2 — Converter shape: `Competition | null`, mapping table unchanged

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

`null` follows the repo's established absence convention (`getOneMatch` → `Match | null`,
`buildGiftInput` → `null`). The file keeps its `Competition` runtime import — mapping
strings to Prisma enum *values* requires the enum at runtime, and only the db layer may do
that, so the mapping cannot move up to the service. `DomainException`/`ErrorCode` imports
are dropped. This file is the unit-test seam: D4's filename-only worry is about the
*runtime import*, which intentionally remains.

### D3 — `loadMatches` reports skips as data; the service decides

`matches.db.interface.ts` gains the contract type and the new signature:

```ts
export type LoadMatchesResult = {
    unknownCompetitions: string[];
};
// ...
abstract loadMatches(matches: FormattedMatch[]): Promise<LoadMatchesResult>;
```

In `matches.db.ts`:
- `syncMatches(matches, updatedMatchIds, unknownCompetitions)` takes a third out-param,
  matching the file's existing out-param pattern (the `updatedMatchIds` comment explains
  why out-params are used: a mid-loop transaction throw swallows return values; the
  `finally` in `loadMatches` must still see committed ids).
- The conversion moves **before** the per-match transaction. On `null`, push
  `match.competition` and `continue` — the skipped match never opens a transaction, so no
  opponent row is upserted for it (previously the throw inside the tx rolled back both the
  upsert and the create, so net DB writes are equivalent).
- `loadMatches` returns `{ unknownCompetitions: [...new Set(unknownCompetitions)] }`
  (deduplicated for the warn log), and its `finally` cache-invalidation block is untouched.

The service (`admin.service.ts`) becomes the raiser:

```ts
const { unknownCompetitions } = await this.matchsDbService.loadMatches(psgMatches);

if (unknownCompetitions.length > 0) {
    this.logger.warn(
        `Skipped matches in unknown competitions: ${unknownCompetitions.join(', ')}`,
    );

    throw new DomainException(ErrorCode.UNKNOWN_COMPETITION);
}
```

`DomainException` and `ErrorCode` are already imported there (`admin.service.ts:4-5`); only
the `logger.warn` is new. The warn log is deliberate: the 400 body only carries the error
code, so this is the first server-side record of *which* competition was unknown. The
mapped HTTP error stays `BadRequestException(ErrorCode.UNKNOWN_COMPETITION)`
(`http-exception.mapper.ts:22-23`, untouched) — 400 with body `unknown_competition`, byte
for byte the current wire shape.

### D4 — Lint re-check: the `^src/db/` clause stays; no `.dependency-cruiser.cjs` change

Asked by the tech-debt entry: after restructure, is the `^src/db/` location clause of
`no-orm-outside-db` still needed (`from: { pathNot: ['^src/db/', '\\.db\\.ts$', '\\.spec\\.ts$'] }`)?

**Answer: yes — the clause stays.** Under D2, `matches.utils.ts` still imports
`@prisma/client` at runtime (enum values), and it is not a `*.db.ts` file — the exact
shape the clause exists to permit. Independently of this file, `prisma.service.ts` imports
`PrismaClient` at runtime and is not `*.db.ts` either, so a filename-only rule would need
explicit exemptions for both (plus the ten type-level files at
`docs/specs/2026-09-16-db-module-split-and-db-rename-design.md` D4 would need `import type`
conversion before the clause could bite). That is strictly more config and a wider diff for
zero user value — the same conclusion D4 reached. The re-check outcome is recorded in this
spec, and entry #3 of `docs/tech-debt.md` (which asks for the re-check) is deleted on
completion. **No lint config edit in either direction.**

### D5 — Test impact inventory

**Change (required to compile/keep green — none assert the old throw):**

| Spec | Change | Why |
|---|---|---|
| `src/db/matches/matches.utils.spec.ts` | **New.** 4 tests: two known strings → enum values; `'Coupe de France'` → `null`; `''` → `null` | The converter's throw was never tested; the new `null` contract gets the coverage the old one lacked. |
| `src/db/matches/matches.db.spec.ts` | **Add** a `when a match has an unknown competition` block: skipped match runs no transaction and the name is reported; valid + unknown mixed still syncs the valid one and reports the unknown; repeated unknowns deduplicate | New `LoadMatchesResult` contract. Existing 6 loadMatches tests only `await` the call and ignore the return value, so they pass unchanged. |
| `src/api/admin/admin.service.spec.ts` | Change the mock shape: `mockResolvedValueOnce(undefined)` → `mockResolvedValueOnce({ unknownCompetitions: [] })` (line 61); **add** a throw test in a `when a match has an unknown competition` block asserting `rejects.toMatchObject({ code: ErrorCode.UNKNOWN_COMPETITION })` and a `when every competition is known` non-throw case, following the file's existing `describe('when …')` / `should …` convention | The interface change makes `undefined` a type error under `mockDeep` typing; the throw test pins the service-raises contract. |

**Unaffected (verified):** `sales-import` specs (never call `loadMatches`; `mockDeep`
stubs it), `matches.service.spec.ts` / `format-match.formatter.spec.ts` (`Competition`
fixtures are the read path, untouched), the `when a mid-loop transaction throws` db spec
(the transaction-error path still rejects and `finally` still invalidates — D1 only
removes the competition throw from the possible mid-loop errors), `admin.controller.ts`
(unchanged propagation), `http-exception.mapper.ts` and `error-codes.enum.ts` (untouched).
`npm run lint:deps` stays green: no new imports anywhere, and the removed
`DomainException`/`ErrorCode` imports only delete edges.

## Ratification points (for the coordinator)

1. **D1 fork:** skip-and-report is the design; flip to abort-and-classify only if the
   partial-sync delta is unacceptable. Everything else stands either way.
2. **D4:** clause stays, no lint edit. Flag if you want the ten type-only files converted
   as a follow-up (out of scope here).

## Files touched on completion

**Modified:** `src/db/matches/matches.utils.ts`, `src/db/matches/matches.db.ts`,
`src/db/matches/matches.db.interface.ts`, `src/api/admin/admin.service.ts`,
`src/api/admin/admin.service.spec.ts`, `docs/tech-debt.md`.
**Created:** `src/db/matches/matches.utils.spec.ts` (+ this spec and the plan).
**Unchanged:** `.dependency-cruiser.cjs`, `package.json`, `web/`, `shared/`, prisma schema.