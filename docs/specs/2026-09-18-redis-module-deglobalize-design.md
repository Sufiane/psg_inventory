# Drop `RedisModule`'s `@Global()` — Make Redis an Explicit Module Edge — Design

**Date:** 2026-09-18
**Status:** Proposed
**Type:** Backend-only refactor. Net-zero at runtime.
**Issue:** PSG-6. "Blocked by" the db-module split (`docs/specs/2026-09-16-db-module-split-and-db-rename-design.md`); that precondition is verified satisfied in «Verification of the precondition» below.

## Problem

`src/redis/redis.module.ts` is `@Global()`, so twelve services across the auth, api and db layers inject `RedisService` with no module edge anywhere. Reading a module tells you nothing about whether it touches Redis, and a service can start depending on Redis with no module edit and no review surface.

This is precisely the problem the db-module split exists to fix for the db layer — the previous spec rejected `@Global()` for `PrismaModule` in its decision D2 for exactly this reason. Leaving Redis global means the codebase is now inconsistent about its shared infrastructure: Prisma is an explicit, enforced edge; Redis is ambient.

This is tech-debt entry #2 in `docs/tech-debt.md`.

## Goal

Make every Redis dependency an explicit, reviewable module edge — the same property the db split established for the database. **No behaviour changes.** No second Redis client, no second connection, no request served differently.

## Non-goals

- Enabling a dependency-cruiser rule that forbids importing `RedisService` directly (the db split's D5 analog). Out of scope: the previous split reasoned about this only for Prisma, and this change does not invent new rules.
- Touching Prisma, the db layer, or any spec.

## Verification of the precondition

The issue was marked blocked by the db-module split (db-split/1-docs … db-split/5-cleanup). Verified in this repo before planning:

- Recent git log shows the db split landed: `refactor(db): replace the DbModule barrel with per-service db modules` (`e9e32b5`), `test(app): compile the AppModule graph to catch missing module imports` (`7f98ff2`), plus the dep-cruiser rule commits (`7bfec56`, `1caf2f2`, `1e91758`), and the spec/plan/tech-debt commit (`7a204d7`).
- `src/app.module.spec.ts` exists and compiles the full `AppModule` graph — the net that catches a missed `imports:` entry.
- `src/db/prisma.module.ts` exists and is **not** `@Global()`. A repo-wide grep for `@Global()` returns exactly one hit: `src/redis/redis.module.ts`. The db layer already uses explicit module edges.
- Baseline gate run empirically on the untouched tree (after `npm ci`): `tsc --noEmit`, `eslint … --max-warnings 0`, `depcruise src --config`, all 25 suites / 290 jest tests, `nest build`, `test -f dist/main.js` — all green, including `src/app.module.spec.ts` (5s, socket-free: `RedisService`'s socket opens in `onModuleInit`, which `compile()` never runs; `BaseRedis`'s constructor only calls `createClient`).

## Findings that change the brief

Three facts read from the tree that the enumeration in the issue brief did not script for:

1. **`src/auth/auth.module.ts` already imports `RedisModule`** (as does `src/app.module.ts`). Today the import is redundant — `@Global()` makes it a no-op — but after de-globalizing it becomes the load-bearing edge for `AuthService`. **No edit needed.**
2. **`src/api/season-passes/season-passes.module.ts` already imports `RedisModule` but no provider in it injects `RedisService`** — neither `SeasonPassesService`, its controller, nor its interface token. The import is dead code: it is a no-op today via `@Global()`, and stays a no-op after de-globalizing (importing a module does not make its exports reachable through this module). The user opted to remove it as part of this change — dead code, now-safe-to-delete — rather than leave it for a later rule.
3. **The 12 injectors are exactly the services named in the brief**, confirmed by grepping every non-spec `RedisService` reference: `auth.service.ts`, five api services (`accounting`, `sales`, `ask`, `admin`, `sales-import`), and six db files (`sales`, `season-passes`, `matches`, `recipients`, `users`, `sales-import`). No controllers inject it. No `@Inject(...)` token-based injection exists anywhere in `src/`. No `app.get(RedisService)` / `moduleRef.get(RedisService)` in production code (`scripts/ungift-sale.ts` only resolves `ISalesService` from the full compiled graph). There is no lazy, reflection-based path that escapes constructor DI enumeration.

The "enumerate imports" approach is therefore **complete**, and `src/app.module.spec.ts` is a genuine net: it is the catch-all for a missed `imports:` entry.

## Module edge table

Each of the 11 owning modules below gains `imports: [RedisModule]` (one entry added to the existing array, placement per the plan's table) and the corresponding import statement. Nest instantiates a module class once regardless of importer count, so no second `RedisService`, no second client, no second connection.

| # | Module file | Owning provider that injects `RedisService` |
|---|---|---|
| 1 | `src/api/sales-import/sales-import.module.ts` | `SalesImportService` |
| 2 | `src/api/accounting/accounting.module.ts` | `AccountingService` |
| 3 | `src/api/admin/admin.module.ts` | `AdminService` |
| 4 | `src/api/ask/ask.module.ts` | `AskService` |
| 5 | `src/api/sales/sales.module.ts` | `SalesService` |
| 6 | `src/db/sales-import/sales-import.db.module.ts` | `SalesImportDb` |
| 7 | `src/db/sales/sales.db.module.ts` | `SalesDb` |
| 8 | `src/db/matches/matches.db.module.ts` | `MatchesDb` |
| 9 | `src/db/users/users.db.module.ts` | `UsersDb` |
| 10 | `src/db/recipients/recipients.db.module.ts` | `RecipientsDb` |
| 11 | `src/db/season-passes/season-passes.db.module.ts` | `SeasonPassesDb` |

Already explicit, no edit: `src/auth/auth.module.ts`, `src/app.module.ts`.

Also edited (dead-import removal): `src/api/season-passes/season-passes.module.ts` loses its `RedisModule` import — no provider in it injects `RedisService` (see finding 2).

Then `src/redis/redis.module.ts` loses `@Global()` and the now-unused `Global` import.

## Decisions

### D1 — Imports are not transitive; each owning module imports `RedisModule` directly

A module that imports another module exposes only what that module **exports**. None of the 12 consuming services' modules export `RedisService`, and importers of db modules (e.g. `CronModule` → `SalesDbModule`) reach the db token, not Redis. So each of the 11 modules whose own provider injects `RedisService` imports `RedisModule` itself — same rule of thumb as the db split's D1 ("consumer composes"). No consumer-one-level-up (e.g. `src/crons/cancel-sales/cancel-sales.module.ts`, `src/api/matches/matches.module.ts`) needs an edit: its providers don't inject Redis.

This is also why `src/app.module.spec.ts` is a sound net: Nest resolves `RedisService` for a provider by walking the provider's *own* module scope and its imports. A missed `imports:` entry cannot be silently papered over by some distant module's import, because Nest does not re-export another module's imports. A miss = `Nest can't resolve dependencies of the ...` at compile.

### D2 — No module cycle introduced

`RedisModule` has no `imports:` and no provider of the 11 consumes any of them, so adding it to any module cannot create a module or file-level cycle. `depcruise`'s `no-circular` stays satisfied — verified by reading the rule set, whose only guard for the redis path is `no-circular` itself; no rule forbids importing `src/redis/` from anywhere (checked all six rules in `.dependency-cruiser.cjs`; nothing references redis).

### D3 — Specs are untouched, and need to be

All 25 spec suites construct a root-scoped `Test.createTestingModule` that provides `RedisService` (or its mock) directly — e.g. `sales.db.spec.ts` supplies `{ provide: RedisService, useValue: mockDeep<RedisService>() }` at the root. No spec imports a real owning module. Resolution never crosses a module boundary, so de-globalizing cannot change what a spec resolves. The unit tests therefore need no edit and act as a regression read on the refactor (they already encode Redis behaviour through mocks).

## Verification

Every commit runs the same gate (the db split's gate verbatim):

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```

The `test -f dist/main.js` line guards the nest build output location exactly as it did in the db split — this change touches no `tsconfig` and must not (root `include` is load-bearing; `tsconfig.build.json`'s exclude of `scripts` keeps `rootDir` at `src`).

The decisive check for this change is `npm test` after the `@Global()` drop: `src/app.module.spec.ts`'s `Test.createTestingModule({ imports: [AppModule] }).compile()` resolves every provider in the whole graph, and a missed `imports: [RedisModule]` anywhere in the 12 consuming modules surfaces there as an unresolvable `RedisService` dependency — not as a runtime failure on whichever route nobody exercised.

## Commit staging

Two commits, each independently green, each staged for `/crit` separately — the same separable-diff discipline as the db split's phases:

1. **Make the Redis edges explicit** — add the 11 `imports: [RedisModule]` (module edge table above) and drop the dead `RedisModule` import from `season-passes.module.ts`. Redundant-but-harmless while `@Global()` is still up; the graph compiles identically.
2. **Drop `@Global()`** from `redis.module.ts` (also removes the now-unused `Global` import).

Commit 1 alone leaves a green tree, commit 2 completes the semantics; `git bisect`-friendly and each is individually reviewable.

## Risk

Low and mechanical. The only behavioural surface is the DI graph, and it is fully exercised by `src/app.module.spec.ts`. The single common failure mode (a missed `imports:` entry) produces a compile-time error in that spec, not a silent runtime break.

## Out-of-scope observations

- **No Redis analog of the db split's D5 rule** ("no direct `PrismaService` import"). This change only removes the ambient availability; a `no-redis-service-outside-redis` rule would be a natural follow-up but is a new decision with its own cost, not part of making the existing edges explicit.