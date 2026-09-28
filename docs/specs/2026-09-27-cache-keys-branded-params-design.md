# CACHE_KEYS branded parameter types — design (PSG-39)

Date: 2026-09-27
Status: approved for planning
Owner: Sufiane

## Goal

`src/redis/CACHE_KEYS.ts` types every cache-key builder parameter as raw
`string`/`number`, even though the codebase already has branded types
(`UserId`, `SeasonYear`, `MatchId`, `SaleId`, `SeasonPassId`, `Email`, …) and
callers hold branded values. Because a branded value is assignable to its raw
base type, every call site compiles today while the branding is silently
dropped at the cache boundary — nothing stops a raw or wrongly-branded id from
building a key. Retype the builder parameters to the existing branded types so
the compiler enforces the same discipline at the cache boundary that it already
enforces everywhere else, and fix the call sites that no longer compile.

This follows the precedent set by PSG-36
(`74465ec`: `emptyAmortization(seasonStartYear: SeasonYear)`), which fixed the
same gap for one parameter: retype the parameter, cast at the raw-data
boundary, leave behavior untouched.

## Non-goals

- No new branded types. `familyId`, `refresh` `secret`, and `hourBucket` have
  no existing brand and stay raw (see D2).
- No changes to any key string, return type (`CacheKey<T>` / `CacheKeyPattern`),
  builder name, or parameter name.
- No new builders, no builder signature reordering, no TTL/cache-logic changes.
- No changes to `shared/` (all needed brands already exist) or to `web/`
  (the frontend never references `CACHE_KEYS`).
- No behavior changes anywhere: brands are type-level only
  (`Brand<T, B> = T & { readonly [brand]: B }`, `shared/src/brand.d.ts`) and
  erase at compile time, so every interpolated key string is byte-identical
  before and after.

## Type mapping — every builder, every parameter

Brands live in `shared/src/ids.d.ts`, `shared/src/time.d.ts`,
`shared/src/strings.d.ts`, imported as `@psg/shared/ids`, `@psg/shared/time`,
`@psg/shared/strings` (tsconfig path `@psg/shared/*` → `./shared/src/*`).

| Builder | Parameter | Current | New |
|---|---|---|---|
| `accounting` | `userId` | `string` | `UserId` |
| `amortization` | `userId` | `string` | `UserId` |
| `amortization` | `seasonStartYear` | `number` | `SeasonYear` |
| `askRateLimit` | `userId` | `string` | `UserId` |
| `askRateLimit` | `hourBucket` | `string` | unchanged (D2) |
| `invalidateAccounting` | `userId` | `string` | `UserId` |
| `invalidateMatches` | — | — | unchanged |
| `match` | `matchId` | `string` | `MatchId` |
| `match` | `withResult` | `boolean` | unchanged |
| `matches` | `from`, `to`, `withResult` | `Date`, `Date?`, `boolean` | unchanged |
| `sale` | `saleId` | `string` | `SaleId` |
| `sales` | `userId` | `string` | `UserId` |
| `salesByMatch` | `userId` | `string` | `UserId` |
| `salesByMatch` | `matchId` | `string` | `MatchId` |
| `salesByRange` | `userId` | `string` | `UserId` |
| `salesByRange` | `from`, `to` | `Date` | unchanged |
| `invalidateSales` | `userId` | `string` | `UserId` |
| `userByEmail` | `email` | `string` | `Email` (D1) |
| `refreshToken` | `familyId`, `secret` | `string`, `string` | unchanged (D2) |
| `invalidateRefreshFamily` | `familyId` | `string` | unchanged (D2) |
| `seasonPass` | `id` | `string` | `SeasonPassId` |
| `seasonPassesBySeason` | `userId` | `string` | `UserId` |
| `seasonPassesBySeason` | `seasonStartYear` | `number` | `SeasonYear` |
| `seasonPasses` | `userId` | `string` | `UserId` |
| `invalidateSeasonPasses` | `userId` | `string` | `UserId` |
| `invalidateSeasonPassById` | `id` | `string` | `SeasonPassId` |
| `recipients` | `userId` | `string` | `UserId` |
| `invalidateRecipients` | `userId` | `string` | `UserId` |

`CACHE_KEYS.ts` gains three imports:
`import type { MatchId, SaleId, SeasonPassId, UserId } from '@psg/shared/ids';`,
`import type { SeasonYear } from '@psg/shared/time';`,
`import type { Email } from '@psg/shared/strings';`.

## Call sites

There are 110 `CACHE_KEYS.*` invocations across 31 files (16 production files,
15 test files). After the retype, ~100 already compile unchanged — they pass
branded fixtures or already-branded parameters. The exact set that breaks:

### Production code (4 files)

1. **`src/api/admin/admin.service.ts`** — `flushUserCache` builds keys from
   the row returned by `findOneByEmail`. Amended after review: user rows are
   branded once in the db layer (`users.db.ts` returns `UserRecord`, see D3),
   so `user.id` / `user.email` are already `UserId` / `Email` at this sink —
   no casts here. The three `invalidateAccounting` / `invalidateSales` /
   `invalidateSeasonPasses` calls and `CACHE_KEYS.userByEmail(user.email)`
   use the fields directly.
2. **`src/db/matches/matches.db.ts`** — the sync loop invalidates per updated
   match using the out-parameter `updatedMatchIds: string[]` (decl line 85,
   `syncMatches` signature decl line 114), populated at line 188 from a Prisma
   match row.
   - Retype the out-parameter and signature to `MatchId[]`.
   - Cast once at the push site: `updatedMatchIds.push(existing.id as MatchId);`
     (`existing` is the upserted Match row — this is the raw-data boundary).
   - The two use sites (lines 102–103) then compile with no cast.
3. **`src/db/sales/sales.db.ts`** (line 252) — `cancelMany` maps a Prisma
   result: `CACHE_KEYS.sale(s.id as SaleId)`, mirroring the existing
   `s.userId as UserId` cast two lines above (line 249).
4. **`src/db/sales-import/sales-import.db.ts`** (line 110) —
   `const saleIds = targets.map((sale) => sale.id as SaleId);`. `saleIds` is
   also passed to Prisma `where: { saleId: { in: saleIds } }`; `SaleId[]` is
   assignable to `string[]`, so nothing else changes.

### Test code (3 files) — literals get casts (D5)

5. **`src/redis/CACHE_KEYS.spec.ts`** —
   `CACHE_KEYS.match('match-id' as MatchId, …)` ×2 (lines 24–25);
   `'user-id' as UserId` ×4 (lines 34, 35, 41, 46). Add the type imports.
6. **`src/db/matches/matches.db.spec.ts`** —
   `'existing-match-id' as MatchId` ×2 (lines 61, 64);
   `'first-match-id' as MatchId` ×2 (lines 145, 148). Add `MatchId` import.
7. **`src/db/sales-import/sales-import.db.spec.ts`** —
   `CACHE_KEYS.sale('sale-1' as SaleId)`, `CACHE_KEYS.sale('sale-2' as SaleId)`
   (lines 229, 232). Add `SaleId` to the existing ids import.
8. **`src/api/admin/admin.service.spec.ts`** — fixture retargeted to the
   db-layer amendment (D3): `{ id: 'user-1', email } as unknown as UserRecord`
   replaces the `Users` assertion; the partial-fixture pattern is unchanged.

(Line numbers in this census are pre-amendment references; imports added by
this change shift subsequent lines by 1–3.)

All other spec call sites already use branded fixtures
(`'user-1' as UserId` in `sales.fixtures.ts` and per-file `const` fixtures) —
verified file-by-file against the 110-call inventory.

## Design decisions (resolved during planning)

- **D1 — `userByEmail` takes `Email`.** The issue text names five params
  (`userId`, `seasonStartYear`, `matchId`, `saleId`, `id`), but the stated
  problem is "raw string/number instead of branded types" generally, and
  `Email` already exists. Both call sites work: `users.db.findOneByEmail`
  already receives `Email`; `admin.service` needs no cast at all (its email
  is branded at the db layer, see D3). Leaving `email`
  raw would preserve the exact gap PSG-39 is about.
- **D2 — `familyId`, `secret`, `hourBucket` stay `string`.** No branded type
  exists for them, and PSG-39 asks only for *existing* brands. Inventing
  `RefreshFamilyId` / `HourBucket` brands is a separate, independently
  valuable decision (note: `RefreshToken` is the *combined*
  `` `${familyId}.${secret}` `` and must not be reused for the parts).
- **D3 — cast at the raw-data boundary, not at the builder.** Established
  convention: `sales.db.ts:249` (`s.userId as UserId`),
  `season-passes.db.ts:95`, `scripts/*.ts`. Boundary casts are one-per-source
  and reviewable; casting inside `CACHE_KEYS` or at each downstream call
  would defeat the point. Amended after review: for *user rows* the boundary
  is the db layer — `users.db.ts` casts each row once to `UserRecord`
  (`Users & { id: UserId; email: Email }`, declared alongside
  `IUsersDbService`) on `findOneByEmail` / `findById`, so every sink
  (`admin.service`, `auth.service`, `jwt.strategy`) gets the brands for free
  and consumer-side casts are removed. Same logic as D4: one cast at the
  source beats casts at the sinks.
- **D4 — retype `updatedMatchIds` to `MatchId[]` rather than casting at its
  two use sites.** One cast at the source beats two at the sinks, and it
  propagates the brand through `syncMatches`'s signature so future use of the
  out-parameter is protected too.
- **D5 — test literals are cast inline** (`'sale-1' as SaleId`), matching the
  repo-wide test convention (`'user-uuid' as UserId`, `2024 as SeasonYear`).
- **D6 — no renames, no return-type changes.** Params keep their names
  (`id` stays `id`); `CacheKey<T>`/`CacheKeyPattern` returns are untouched so
  `redisService.get/invalidate/invalidatePattern` typing is unaffected.

## Error handling

N/A — compile-time-only change. No new failure modes at runtime; key strings
are identical, so existing cache entries remain valid across the deploy and
no cache warm-up/migration is needed.

## Scope: backend only

- `src/redis/CACHE_KEYS.ts` is referenced only from `src/` (31 files); `web/`
  has zero references, `scripts/` and e2e have zero references.
- `shared/` needs no edit — all brands already exist.
- Therefore no frontend work and no shared-package work exists; backend tasks
  are independent of any frontend track.

## Verification

1. `npm run typecheck` (`tsc --noEmit`, includes `src/**/*` and `scripts/**/*`)
   — this *is* the failing test for this change: it enumerates every call site
   the retype breaks.
2. `npm run lint` (eslint, `--max-warnings 0`) and `npm run lint:deps`.
3. `npm test` (vitest) — behavioral assertions on key strings must pass
   unchanged; only the type-cast edits above touch spec files.
