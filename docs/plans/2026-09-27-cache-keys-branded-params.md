# CACHE_KEYS Branded Parameter Types (PSG-39) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retype every `src/redis/CACHE_KEYS.ts` builder parameter to the existing branded type it semantically represents, and fix the ~7 files whose call sites stop compiling.

**Architecture:** Pure type-level refactor in one backend file plus boundary casts where raw Prisma/string data enters the cache layer. Brands are erased at compile time, so no key string, return type, or runtime behavior changes. The TypeScript compiler is the test: `npm run typecheck` enumerates every call site the retype breaks, and the spec's call-site census is the expected error list.

**Tech Stack:** TypeScript (branded types via `shared/src/brand.d.ts`), NestJS backend, vitest, eslint, dependency-cruiser.

**Spec:** `docs/specs/2026-09-27-cache-keys-branded-params-design.md`

## Global Constraints

- Zero runtime behavior change: every cache-key string must be byte-identical before and after. No TTL, builder-name, parameter-name, or return-type (`CacheKey<T>` / `CacheKeyPattern`) changes.
- No new branded types. `familyId`, `refresh` `secret`, and `hourBucket` stay `string` (spec D2).
- Cast only at raw-data boundaries (Prisma rows, `string[]` out-params), never inside `CACHE_KEYS` and never to force a call to compile where the value is already branded (spec D3).
- Test literals get inline casts (`'sale-1' as SaleId`), matching the repo convention (spec D5).
- Backend only: do not touch `web/` or `shared/`.
- All imports of brands use `import type { … } from '@psg/shared/ids' | '@psg/shared/time' | '@psg/shared/strings'`.
- Verification commands (run from repo root): `npm run typecheck`, `npm run lint`, `npm run lint:deps`, `npm test`.
- **No commits until Task 4.** Tasks 1–3 intentionally leave the tree compile-red; committing intermediate red states would break `main`'s typecheck gate. One code commit + one docs commit at the end.
- Conventional commits, issue tag `(PSG-39)`.

---

## Phase A — Retype the builder (compile-red on purpose)

### Task 1: Retype `src/redis/CACHE_KEYS.ts` parameters

**Files:**
- Modify: `src/redis/CACHE_KEYS.ts` (all 69 lines; parameters only)

**Interfaces:**
- Consumes: brands from `@psg/shared/ids` (`UserId`, `MatchId`, `SaleId`, `SeasonPassId`), `@psg/shared/time` (`SeasonYear`), `@psg/shared/strings` (`Email`) — all already exist, `shared/` is not edited.
- Produces: the same default-export object shape with narrowed parameter types. Every builder keeps its exact name and return type; Tasks 2–3 depend only on the new parameter types listed below.

- [ ] **Step 1: Add the brand imports**

After the existing first line (`import type { CacheKey, CacheKeyPattern } from '@psg/shared/cache';`), insert three imports so the head of the file reads:

```ts
import type { CacheKey, CacheKeyPattern } from '@psg/shared/cache';
import type { MatchId, SaleId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Email } from '@psg/shared/strings';
import type { SeasonYear } from '@psg/shared/time';
import type { Users } from '@prisma/client';
```

- [ ] **Step 2: Apply every parameter retyping below (19 edits, exact old → new pairs)**

```diff
      accounting: (
-        userId: string,
+        userId: UserId,
          start: Date,

-    amortization: (userId: string, seasonStartYear: number): CacheKey<Amortization> =>
+    amortization: (userId: UserId, seasonStartYear: SeasonYear): CacheKey<Amortization> =>

-    askRateLimit: (userId: string, hourBucket: string): CacheKey<number> =>
+    askRateLimit: (userId: UserId, hourBucket: string): CacheKey<number> =>

-    invalidateAccounting: (userId: string): CacheKeyPattern =>
+    invalidateAccounting: (userId: UserId): CacheKeyPattern =>

-    match: (matchId: string, withResult: boolean = false): CacheKey<Match> =>
+    match: (matchId: MatchId, withResult: boolean = false): CacheKey<Match> =>

-    sale: (saleId: string): CacheKey<Sale> => `sale:id:${saleId}` as CacheKey<Sale>,
+    sale: (saleId: SaleId): CacheKey<Sale> => `sale:id:${saleId}` as CacheKey<Sale>,

-    sales: (userId: string): CacheKey<Sale[]> =>
+    sales: (userId: UserId): CacheKey<Sale[]> =>

-    salesByMatch: (userId: string, matchId: string): CacheKey<Sale[]> =>
+    salesByMatch: (userId: UserId, matchId: MatchId): CacheKey<Sale[]> =>

-    salesByRange: (userId: string, from: Date, to: Date): CacheKey<Sale[]> =>
+    salesByRange: (userId: UserId, from: Date, to: Date): CacheKey<Sale[]> =>

-    invalidateSales: (userId: string): CacheKeyPattern =>
+    invalidateSales: (userId: UserId): CacheKeyPattern =>

-    userByEmail: (email: string): CacheKey<Users> =>
+    userByEmail: (email: Email): CacheKey<Users> =>

-    seasonPass: (id: string): CacheKey<SeasonPass> =>
+    seasonPass: (id: SeasonPassId): CacheKey<SeasonPass> =>

     seasonPassesBySeason: (
-        userId: string,
-        seasonStartYear: number,
+        userId: UserId,
+        seasonStartYear: SeasonYear,
     ): CacheKey<SeasonPass[]> =>

-    seasonPasses: (userId: string): CacheKey<SeasonPass[]> =>
+    seasonPasses: (userId: UserId): CacheKey<SeasonPass[]> =>

-    invalidateSeasonPasses: (userId: string): CacheKeyPattern =>
+    invalidateSeasonPasses: (userId: UserId): CacheKeyPattern =>

-    invalidateSeasonPassById: (id: string): CacheKeyPattern =>
+    invalidateSeasonPassById: (id: SeasonPassId): CacheKeyPattern =>

-    recipients: (userId: string): CacheKey<RecipientWithGiftCount[]> =>
+    recipients: (userId: UserId): CacheKey<RecipientWithGiftCount[]> =>

-    invalidateRecipients: (userId: string): CacheKeyPattern =>
+    invalidateRecipients: (userId: UserId): CacheKeyPattern =>
```

**Do not change:** `invalidateMatches()`, `matches(from, to, withResult)`, `refreshToken(familyId, secret)`, `invalidateRefreshFamily(familyId)`, `askRateLimit`'s `hourBucket`, and every template-literal body.

- [ ] **Step 3: Run typecheck and verify the error census matches the spec**

Run: `npm run typecheck`

Expected: FAIL — but **only** in these 7 files, nowhere else:

| File | Sites that must be failing |
|---|---|
| `src/api/admin/admin.service.ts` | `user.id` ×3, `user.email` ×1 |
| `src/db/matches/matches.db.ts` | `CACHE_KEYS.match(matchId, …)` ×2 (lines ~102–103) |
| `src/db/sales/sales.db.ts` | `CACHE_KEYS.sale(s.id)` ×1 (line ~252) |
| `src/db/sales-import/sales-import.db.ts` | `CACHE_KEYS.sale(id)` ×1 (line ~132) |
| `src/redis/CACHE_KEYS.spec.ts` | raw literals `'match-id'` ×2, `'user-id'` ×4 |
| `src/db/matches/matches.db.spec.ts` | raw literals ×4 |
| `src/db/sales-import/sales-import.db.spec.ts` | raw literals `'sale-1'`, `'sale-2'` |

If any *other* file fails, stop and re-audit that call site against the spec's 110-call inventory — do not paper over it with a cast.

---

## Phase B — Production call sites

### Task 2: Fix the 4 production callers

**Files:**
- Modify: `src/db/users/users.db.interface.ts` + `src/db/users/users.db.ts` (brand the row — amended Step 1)
- Modify: `src/api/admin/admin.service.ts` (no casts needed after the db-layer brand)
- Modify: `src/auth/auth.service.ts`, `src/auth/strategies/jwt.strategy.ts`, `src/api/admin/admin.service.spec.ts` (drop now-redundant sink casts / retarget fixture)
- Modify: `src/db/matches/matches.db.ts` (lines ~85, ~114, ~188)
- Modify: `src/db/sales/sales.db.ts` (line ~252)
- Modify: `src/db/sales-import/sales-import.db.ts` (imports + line ~110)

**Interfaces:**
- Consumes: retyped builders from Task 1.
- Produces: `updatedMatchIds: MatchId[]` and `saleIds: SaleId[]` locals; no signature visible to other tasks changes (`syncMatches` is private to `matches.db.ts`).

- [ ] **Step 1: brand the `Users` row in the db layer (superseded — see spec D3 amendment)**

> **Amended after user review:** rather than casting in `admin.service.ts`, brand the row once where it materializes. This plan's original instruction (a hoisted `UserId` cast in `flushUserCache` + an inline `Email` cast) was replaced by:
>
> 1. `src/db/users/users.db.interface.ts` — `export type UserRecord = Users & { id: UserId; email: Email };` with `findOneByEmail`/`findById` returning `Promise<UserRecord | null>`.
> 2. `src/db/users/users.db.ts` — assert both returns `as Promise<UserRecord | null>` (whole-result cast; no spread, no `await` added, zero emitted-JS change).
> 3. `src/api/admin/admin.service.ts` — no casts at all: use `user.id` / `user.email` directly (the file ends up byte-identical to HEAD).
> 4. Bonus sinks dissolved by the same brand: `src/auth/auth.service.ts` (`validateUser` returns `safe`; `issueTokenPair(user.id, user.email, …)`), `src/auth/strategies/jwt.strategy.ts` (returns `safe`), `src/api/admin/admin.service.spec.ts` fixture retargeted to `UserRecord`. The raw-Redis `stored.value as UserId` cast stays — different boundary.
>
> The typecheck RED census for this amendment: retyping the interface alone fails exactly `users.db.ts`, proving the cast belongs there.

- [ ] **Step 2: `matches.db.ts` — retype the out-parameter, cast once at the push**

Three exact edits (`MatchId` is already imported at line 9):

```diff
-        const updatedMatchIds: string[] = [];
+        const updatedMatchIds: MatchId[] = [];

      private async syncMatches(
          matches: FormattedMatch[],
-        updatedMatchIds: string[],
+        updatedMatchIds: MatchId[],
          unknownCompetitions: string[],
      ): Promise<void> {

-                    updatedMatchIds.push(existing.id);
+                    updatedMatchIds.push(existing.id as MatchId);
```

The two use sites (`CACHE_KEYS.match(matchId, true/false)` in the `finally` block) need no edit — they now compile because `matchId: MatchId`.

- [ ] **Step 3: `sales.db.ts` — cast the Prisma row id**

Exact edit (line ~252; mirrors the `s.userId as UserId` cast two lines above):

```diff
-            ...affected.map((s) => this.redisService.invalidate(CACHE_KEYS.sale(s.id))),
+            ...affected.map((s) => this.redisService.invalidate(CACHE_KEYS.sale(s.id as SaleId))),
```

`SaleId` is already imported at line 5.

- [ ] **Step 4: `sales-import.db.ts` — brand the id list at its source**

Extend the existing ids import (line 3):

```diff
-import type { UserId } from '@psg/shared/ids';
+import type { SaleId, UserId } from '@psg/shared/ids';
```

Exact edit (line ~110):

```diff
-        const saleIds = targets.map((sale) => sale.id);
+        const saleIds = targets.map((sale) => sale.id as SaleId);
```

No other change: `saleIds` is also used in `where: { saleId: { in: saleIds } }`, and `SaleId[]` is assignable to `string[]`.

- [ ] **Step 5: Run typecheck — production must be clean**

Run: `npm run typecheck`

Expected: FAIL, but now **only** in the 3 spec files: `src/redis/CACHE_KEYS.spec.ts`, `src/db/matches/matches.db.spec.ts`, `src/db/sales-import/sales-import.db.spec.ts`. Zero errors in `src/api/`, `src/auth/`, and the other `src/db/` files.

---

## Phase C — Test call sites

### Task 3: Fix raw-literal arguments in the 3 specs

**Files:**
- Modify: `src/redis/CACHE_KEYS.spec.ts`
- Modify: `src/db/matches/matches.db.spec.ts`
- Modify: `src/db/sales-import/sales-import.db.spec.ts`

**Interfaces:**
- Consumes: retyped builders from Task 1.
- Produces: green `npm run typecheck` and green targeted vitest run; no test assertion changes.

- [ ] **Step 1: `CACHE_KEYS.spec.ts` — cast literals, add imports**

Head of file becomes:

```ts
import type { MatchId, UserId } from '@psg/shared/ids';

import CACHE_KEYS from './CACHE_KEYS';
```

Exact call-site edits (assertions are untouched — key strings don't change):

```diff
-                const withResult = CACHE_KEYS.match('match-id', true);
-                const withoutResult = CACHE_KEYS.match('match-id', false);
+                const withResult = CACHE_KEYS.match('match-id' as MatchId, true);
+                const withoutResult = CACHE_KEYS.match('match-id' as MatchId, false);

-            const key = CACHE_KEYS.sales('user-id');
-            const prefix = CACHE_KEYS.invalidateSales('user-id').replace('*', '');
+            const key = CACHE_KEYS.sales('user-id' as UserId);
+            const prefix = CACHE_KEYS.invalidateSales('user-id' as UserId).replace('*', '');

-            const key = CACHE_KEYS.salesByRange(
-                'user-id',
+            const key = CACHE_KEYS.salesByRange(
+                'user-id' as UserId,
                  new Date('2025-08-01T00:00:00.000Z'),
                  new Date('2026-08-01T00:00:00.000Z'),
              );
-            const prefix = CACHE_KEYS.invalidateSales('user-id').replace('*', '');
+            const prefix = CACHE_KEYS.invalidateSales('user-id' as UserId).replace('*', '');
```

(6 edits total: 2 `MatchId`, 4 `UserId`.)

- [ ] **Step 2: `matches.db.spec.ts` — cast 4 literals**

Add `import type { MatchId } from '@psg/shared/ids';` above the existing `import type { OpponentName } from '@psg/shared/strings';` (line 10).

Exact edits:

```diff
-                    CACHE_KEYS.match('existing-match-id', true),
+                    CACHE_KEYS.match('existing-match-id' as MatchId, true),

-                    CACHE_KEYS.match('existing-match-id', false),
+                    CACHE_KEYS.match('existing-match-id' as MatchId, false),

-                    CACHE_KEYS.match('first-match-id', true),
+                    CACHE_KEYS.match('first-match-id' as MatchId, true),

-                    CACHE_KEYS.match('first-match-id', false),
+                    CACHE_KEYS.match('first-match-id' as MatchId, false),
```

- [ ] **Step 3: `sales-import.db.spec.ts` — cast 2 literals**

`SaleId` is not yet imported. Extend line 6:

```diff
-import type { MatchId, RecipientId, UserId } from '@psg/shared/ids';
+import type { MatchId, RecipientId, SaleId, UserId } from '@psg/shared/ids';
```

Exact edits (lines ~229, ~232):

```diff
-                    CACHE_KEYS.sale('sale-1'),
+                    CACHE_KEYS.sale('sale-1' as SaleId),

-                    CACHE_KEYS.sale('sale-2'),
+                    CACHE_KEYS.sale('sale-2' as SaleId),
```

- [ ] **Step 4: Typecheck green**

Run: `npm run typecheck`
Expected: PASS (zero output, exit 0).

- [ ] **Step 5: Run the touched specs**

Run: `npx vitest run src/redis/CACHE_KEYS.spec.ts src/db/matches/matches.db.spec.ts src/db/sales-import/sales-import.db.spec.ts`
Expected: PASS — all suites green, assertion text unchanged.

---

## Phase D — Verify and land

### Task 4: Full verification + commits

**Files:**
- None modified beyond a final sanity pass; commits the whole change.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: green pipeline, one code commit, one docs commit.

- [ ] **Step 1: Full gate**

Run, in order, from repo root:

```bash
npm run typecheck   # expected: PASS
npm run lint        # expected: PASS, --max-warnings 0
npm run lint:deps   # expected: PASS
npm test            # expected: PASS, full vitest suite
```

If lint flags import ordering, run `npm run lint:fix` and re-run `npm run lint`.

- [ ] **Step 2: Behavioral spot-check — key templates byte-identical**

Extract every template literal from the file before (HEAD, still pre-commit) and after, and diff them:

```bash
diff <(git show HEAD:src/redis/CACHE_KEYS.ts | grep -o '`[^`]*`') <(grep -o '`[^`]*`' src/redis/CACHE_KEYS.ts)
```

Expected: no output, exit 0 — every cache-key template is byte-identical; only parameter annotations changed. (Run before Step 3 commits, or `HEAD` will no longer be the pre-change revision.)

- [ ] **Step 3: Commit the code**

```bash
git add src/redis/CACHE_KEYS.ts src/db/users/users.db.interface.ts src/db/users/users.db.ts src/api/admin/admin.service.ts src/api/admin/admin.service.spec.ts src/auth/auth.service.ts src/auth/strategies/jwt.strategy.ts src/db/matches/matches.db.ts src/db/sales/sales.db.ts src/db/sales-import/sales-import.db.ts src/redis/CACHE_KEYS.spec.ts src/db/matches/matches.db.spec.ts src/db/sales-import/sales-import.db.spec.ts
git commit -m "fix(redis): use branded types for CACHE_KEYS params (PSG-39)"
```

- [ ] **Step 4: Commit the docs**

```bash
git add docs/specs/2026-09-27-cache-keys-branded-params-design.md docs/plans/2026-09-27-cache-keys-branded-params.md .serena/memories/conventions.md
git commit -m "docs(redis): record PSG-39 spec and plan"
```

- [ ] **Step 5: Report**

Confirm in the handoff: typecheck/lint/lint:deps/test all green, all touched files committed (CACHE_KEYS + the db-layer brand set + specs), zero runtime diff.
