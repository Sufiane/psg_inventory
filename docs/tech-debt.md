# Tech debt & deferred decisions

Things found while working on something else, deliberately not fixed at the time. Each
entry says what it is, why it was deferred, and what acting on it would cost — so the
decision can be re-taken later with the same information, instead of re-derived.

Add an entry when you find something real but out of scope. Delete it when it's done.

---

## 2. `RedisModule` is `@Global()` — the same invisible-availability shape we removed from the db layer

**Found:** 2026-09-16, while planning the db-module split.

`src/redis/redis.module.ts` is `@Global()`, so six db services inject `RedisService` with
no module edge anywhere. Reading a module tells you nothing about whether it touches
Redis, and a service can start depending on Redis with no module edit and no review
surface.

This is precisely the problem the db-module split exists to fix for the db layer — see
`docs/specs/2026-09-16-db-module-split-and-db-rename-design.md`, D2, where `@Global()` was
rejected for `PrismaModule` for exactly this reason. Leaving Redis global means the
codebase is now inconsistent about it: one shared infrastructure dependency is explicit,
the other is ambient.

**Why deferred:** different module, different decision, and folding it into the db
refactor would have widened a change that was scoped to be net-zero and mechanically
reviewable.

**Cost to act:** low and genuinely net-zero. Drop `@Global()`, then add
`imports: [RedisModule]` to each module whose providers inject `RedisService` — the six db
modules plus anything else the compiler then complains about. Nest instantiates a module
class once regardless of how many importers it has, so there is no second client and no
second connection.

**Recommendation:** do it, and do it *after* the db split lands, so the two diffs stay
separable. `src/app.module.spec.ts` (added by that plan) is the net that catches a missed
`imports:` entry.

---

## 3. `e2e/package.json` has no own `lint` script or `eslint` devDependency

**Found:** 2026-09-24, code review of `scripts/seed-e2e.ts` (PSG-32).

`e2e/` is a standalone package (own `package.json`, own `package-lock.json`, not an npm
workspace member of the root). It currently lints clean only because ESLint's flat config
resolution climbs up the directory tree and picks up the root `eslint.config.mjs`. `e2e/`
itself declares no `lint` script and no `eslint`/`typescript-eslint`/`@eslint/js`/`globals`
devDependencies.

**Why deferred:** out of scope for the seed-script idempotency fix it was found next to,
and low current risk — `e2e/` is always run from inside this repo tree today, so the
climb-up resolution always finds the root config.

**Cost to act:** low. Add a `"lint": "eslint \"**/*.ts\" --max-warnings 0"` script to
`e2e/package.json`, plus `eslint`, `@eslint/js`, `typescript-eslint`, and `globals` as
devDependencies pinned to the exact versions already used at the repo root
(`eslint@9.17.0`, `@eslint/js@9.17.0`, `typescript-eslint@8.70.0`, `globals@15.13.0`), and
give `e2e/` its own `eslint.config.mjs` (or explicitly re-export the root one) so the
package lints correctly if it's ever installed/run standalone, outside this repo tree.

**Recommendation:** do it if/when `e2e/` is ever extracted, run in CI independently of the
root `npm run lint`, or published/installed on its own. Not worth doing preemptively for a
directory that today is always run in place.

---

