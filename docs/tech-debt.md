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

