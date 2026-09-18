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

## 3. `matches.utils.ts` throws a domain exception from the db layer

**Found:** 2026-09-16, while planning the db-module split.

`src/db/matches/matches.utils.ts` throws a `DomainException`. The global CLAUDE.md's
hexagonal rules put domain throws in the service layer: "No domain throws here — return
`null`/`undefined` and let the service decide."

**Why deferred:** unlike the other two, this is not a mechanical change. Moving the throw
means deciding what the db layer returns instead and making the calling service raise —
which changes control flow on a path that currently has test coverage built around the
current behavior. That is a behavior-risk change and does not belong in a refactor that
claims to be net-zero.

**Also note:** `matches.utils.ts` is the one file under `src/db/` that imports Prisma for a
*runtime* value (`Competition.CHAMPIONSHIP`, `Competition.CHAMPIONS_LEAGUE`) rather than a
type. That is why `no-orm-outside-db` has to keep its `^src/db/` location clause and
cannot become filename-only (spec D4). If this file is ever restructured, re-check whether
that clause is still needed.

**Cost to act:** needs its own read of the call sites and their tests before a shape can be
proposed. Not a one-sitting change.

**Recommendation:** lowest priority of the three. Worth doing when `matches` is being
touched for another reason, not on its own.

---

## 4. Jest cannot load pure-ESM deps, so nothing could import the real `AppModule`

**Found:** 2026-09-16, while adding `src/app.module.spec.ts` in the db-module split.

`@nestjs/observe` is pure ESM (`"type": "module"`, `dist/index.js` uses `export *`).
Jest's `transformIgnorePatterns` defaults to `node_modules/` and the config in
`package.json` does not override it, so the package is never transformed and CJS
`require()` of it throws `SyntaxError: Unexpected token 'export'`.

`src/app.module.ts` imports `./observe` unconditionally at the top, and `src/observe.ts`
imports `@nestjs/observe` unconditionally — so *any* spec that imports the real
`AppModule` dies on load, before a single line of env or DI logic runs. This was invisible
for the repo's whole history because no spec had ever imported `AppModule`.

**Worked around, not fixed:** `src/app.module.spec.ts` stubs the local wrapper with
`jest.mock('./observe', …)`. That costs nothing in this spec's coverage —
`OBSERVE_APP_KEY`/`OBSERVE_APP_SECRET` are unset there, so `ObserveModule` never enters
the graph the spec exists to compile. But the general gap remains: the next spec that
wants the real `AppModule` has to repeat the same mock, and any future pure-ESM dependency
will hit the same wall.

**Why deferred:** the refactor it surfaced in was contractually net-zero and forbade
`package.json` changes, and the jest config lives under `package.json`'s `"jest"` key.
Changing transform behaviour repo-wide is also not a change worth making blind at the tail
end of an unrelated refactor.

**Cost to act:** medium and somewhat fiddly. Either add a `transformIgnorePatterns`
override that allow-lists ESM packages (`"node_modules/(?!(@nestjs/observe)/)"`) — note
`ts-jest` still has to emit CJS for it — or move the jest config out of `package.json`
into a `jest.config.ts` first, which is worth doing on its own merits. Budget time for
ESM/CJS interop trial and error rather than assuming it is a one-line fix.

**Recommendation:** do it when a second spec needs the real `AppModule`, or when the next
pure-ESM dependency lands — whichever comes first. Until then the one-line mock is honest
and localised.
