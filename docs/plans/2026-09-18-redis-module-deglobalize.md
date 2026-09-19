# Drop `RedisModule`'s `@Global()` — Make Redis an Explicit Module Edge — Plan

**Date:** 2026-09-18
**Spec:** `docs/specs/2026-09-18-redis-module-deglobalize-design.md`
**Type:** Backend-only, net-zero refactor.
**Precondition:** db-module split landed. Verified: `@Global()` exists only in `redis.module.ts`; `src/app.module.spec.ts` present; `PrismaModule` non-global; baseline gate green (see Step 0).

## Commands

The repo gate — run after every step that changes code:

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```

Types resolved via the repo's own npm scripts. (If a `mise` shim for `tsc` shadows the local binary in your shell, prepend the project bin dir: `export PATH="$PWD/node_modules/.bin:$PATH"`.)

## Step 0 — Baseline (no edits)

- `npm ci`, then the gate above. Confirmed green at plan time: typecheck, lint, `depcruise` (231 modules / 936 edges), 25 suites / 290 jest tests (incl. `src/app.module.spec.ts`, 5s, socket-free), `nest build` + `dist/main.js`.

## Step 1 — Make the Redis edges explicit [commit 1]

Two kinds of edit:

**Add.** For each of the 11 owning modules: `import { RedisModule } from '<relpath>/redis/redis.module';` and append `RedisModule` to the existing `imports:` array. Do **not** add an `exports` entry — consumers reach Redis only through their own import (spec D1).

| File | Where to put the entry relative to the existing `imports:` |
|---|---|
| `src/api/sales-import/sales-import.module.ts` | before `SalesImportDbModule` |
| `src/api/accounting/accounting.module.ts` | anywhere (db modules are a single line) |
| `src/api/admin/admin.module.ts` | after `UsersDbModule` |
| `src/api/ask/ask.module.ts` | after `LlmModule` |
| `src/api/sales/sales.module.ts` | after `RecipientsDbModule` |
| `src/db/sales-import/sales-import.db.module.ts` | add ``import { RedisModule } from '../../redis/redis.module';``, append to `imports` |
| `src/db/sales/sales.db.module.ts` | same |
| `src/db/matches/matches.db.module.ts` | same |
| `src/db/users/users.db.module.ts` | same |
| `src/db/recipients/recipients.db.module.ts` | same |
| `src/db/season-passes/season-passes.db.module.ts` | same |

Field copy for each db module (path is always `../../redis/redis.module` from `src/db/<x>/`, `RedisModule` appended to `imports`):

```ts
import { RedisModule } from '../../redis/redis.module';
// ...
imports: [PrismaModule, RedisModule],             // matches, users, recipients, season-passes
imports: [PrismaModule, RecipientsDbModule, RedisModule],  // sales, sales-import
```

**Remove (dead code).** `src/api/season-passes/season-passes.module.ts` drops its `import { RedisModule } ...` and the `RedisModule` entry from its `imports:` array — no provider in that module injects `RedisService` (spec finding 2; no-op before and after de-globalizing).

**Do not touch:** `auth.module.ts`, `app.module.ts` (already import `RedisModule`).

Guard: no spec imports a real module, so the gate runs unaffected; `src/app.module.spec.ts` must stay green.

Green: run the gate. Then stage and hold for `/crit`.

## Step 2 — Drop `@Global()` [commit 2]

`src/redis/redis.module.ts`:

```diff
- import { Global, Module } from '@nestjs/common';
+ import { Module } from '@nestjs/common';
...
- @Global()
 @Module({
```

This is the semantic commit. If any of the 11 Step-1 edges was missed, `npm test` now fails in `src/app.module.spec.ts` with `Nest can't resolve dependencies` for the owning provider — that spec is the net (it did not exist before the db split; without a fix, the runtime error would have surfaced on whichever route uses the missed service).

Green: run the gate. Stage and hold for `/crit`.

## Step 3 — Close the loop

- `git log` should show the two commits in order; `git diff` of commit 2 must be exactly the `redis.module.ts` decorator/import change.
- `npm run lint:deps` output should still be `no dependency violations found` (spec D2: no rule references redis; no cycle possible).
- Confirm `dist/main.js` still exists after the final `npm run build` (the `test -f dist/main.js` line in the gate).
- Reread the tech-debt entry: `docs/tech-debt.md` §2 stays as-is (the issue is tracked by PSG-6; delete the entry only if the team's convention wants it gone once done).
- Cherry-pick risk: none — no other branch in flight for `src/redis/` or the 12 owning modules known at plan time.

## Done definition

`@Global()` gone; every module whose providers inject `RedisService` imports `RedisModule` explicitly; the dead `season-passes.module.ts` import removed; the full gate green on both commits; `npm test` proves graph completeness via `src/app.module.spec.ts`.