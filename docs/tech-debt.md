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

## 4. `emptyAmortization`'s `seasonStartYear` param is a plain `number`, not `SeasonYear`

**Linear:** PSG-36

**Found:** 2026-09-26, code review of the `get-amortization` usecase extraction (PSG-29).

`get-amortization.usecase.ts`'s module-level `emptyAmortization(seasonStartYear: number)`
takes a plain `number` while every other signature in the file (and the `Amortization` type
it returns) uses the branded `SeasonYear` type. Pre-existing — moved verbatim from
`AccountingService`, not introduced by the extraction.

**Why deferred:** the extraction was scoped as a pure, byte-identical move; widening it to
also fix an unrelated type-narrowing gap would have obscured the diff.

**Cost to act:** trivial — change the parameter type to `SeasonYear` and confirm the single
call site (`execute`, passing `seasonStartYear: SeasonYear`) still type-checks.

**Recommendation:** fix opportunistically next time this file is touched.

---

## 5. `get-amortization.usecase.spec.ts` uses flat `it()` titles instead of nested `describe`-per-branch

**Linear:** PSG-37

**Found:** 2026-09-26, code review of the `get-amortization` usecase extraction (PSG-29).

The CLAUDE.md Jest/Vitest convention requires a `describe` per conditional branch (`when
X`), with `it` titles stating only the outcome. This spec instead encodes the condition
directly in flat `it()` titles (e.g. `'caps progress at 1 and reports surplus on
overshoot'`). Pre-existing — the same flat structure existed in `accounting.service.spec.ts`
before the extraction; it was relocated, not introduced.

**Why deferred:** restructuring the tests wasn't part of the pure-move scope for PSG-29 and
would have inflated the diff of what's supposed to be a mechanical extraction.

**Cost to act:** moderate — regroup the 8 `it`s under `describe` blocks per branch (no pass,
below price, break-even crossing, overshoot, missing pass, cache hit, cache key/ttl, redis
nullish fallback). No behavior change, pure test restructuring.

**Recommendation:** fold into a future test-hygiene pass rather than doing alone.

---

## 6. `sales-import.resolver.spec.ts` and `sales-import.service.spec.ts` have condition-in-title flat `it`s

**Found:** 2026-09-27, while fixing PSG-42 (`sales-import.csv.spec.ts` branch nesting).

Same class as §5: the house Jest/Vitest convention (restated in every plan doc's
conventions section, e.g. `docs/plans/2026-08-30-ask-a-question.md`) wants one
`describe('when …')` per conditional branch, with `it` titles stating only the outcome.

- `sales-import.resolver.spec.ts`: 10 flat `it`s sit directly under
  `describe('resolveDraftRows')` (lines 81-171, 275, 286), eight of them with the
  condition in the title — `'flags a mismatched opponent as warn'`, `'errors on nb>1 with
  multi-pass and leaves allocations empty'`, `'accepts an optional soldAt on or before the
  match date'`, and five more. The other two (`'lists missing matches in coverage'`,
  `'counts summary correctly'`) are outcome-only titles — still flat `it`s, just not
  condition-in-title. Of the file's other groups, `gift recipient requirement` is
  conformant, but `kickoff guard on soldAt` has residual condition-in-title `it`s of the
  same class: four copies of `'flags a soldAt after the match date as
  error:sold-after-kickoff'` (lines 185, 200, 242, 257), plus `'imports cleanly with a
  soldAt on the match date'` (line 217) sitting under `describe('when the row status is
  GIFTED')` with no describe for the soldAt condition itself. Tracked in PSG-44.
- `sales-import.service.spec.ts`: flat `it`s under `describe('preview')`,
  `describe('commit')` and `describe('revert')` — `'throws SEASON_PASS_FORBIDDEN when
  pass belongs to other user'`, `'throws IMPORT_PASSES_MIXED_SEASONS when passes differ in
  year'`, `'is idempotent when nothing matches'` — while `revert` also contains conformant
  `when sales are deleted` / `when nothing matches` describes, the same partial state
  PSG-42's file had. Tracked in PSG-43.

**Why deferred:** PSG-42 is deliberately scoped to one spec file (single-file precedent:
PSG-37, `c29bf5a`); restructuring two more files would turn an XS issue into a
review-noise diff.

**Cost to act:** moderate — same mechanical treatment as PSG-42: wrap each flat `it` in a
`when …` describe, move the condition out of the title, leave bodies untouched. No
behavior change; tests must stay green before and after.

**Recommendation:** fold into a future test-hygiene pass rather than doing alone.

---

