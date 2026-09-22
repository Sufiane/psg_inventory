# Extract `SalesImportService.commit` into its own usecase — Design

**Date:** 2026-09-22
**Status:** Draft
**Issue:** PSG-26
**Type:** Backend-only refactor. Net-zero at runtime. No API, behavior, cache-key, or test-contract change.

## Problem

`SalesImportService.commit` (`src/api/sales-import/sales-import.service.ts:69–114`) has outgrown simple orchestration. One method now: validates season passes (`assertPasses`), loads the season's home matches, re-validates rows server-side (`validateCommitRows`), maps rows into bulk-sale inputs (profit, `soldAt` noon-UTC pinning, gift input via `buildGiftInput`, allocations), writes the batch, and conditionally invalidates caches — with three private helpers that exist to serve it.

Meanwhile the sales module has established the usecase convention (PSG-16 → PSG-17 → PSG-24): write intents are extracted into `sales/usecases/<name>/` split into `<name>.usecase.ts` (business logic, no ORM) + `<name>.usecase.db.ts` (the folder's db file, scoped to that usecase's queries), each behind an `I<Name>Usecase` token, with `SalesService` shrinking to a thin delegate. PSG-26 applies the same extraction to the sales-import module's `commit`.

### Verified repo state (ticket assumptions checked against this branch)

| Assumption | Verified |
|---|---|
| `commit` routes gift vs non-gift intents, validates passes, builds gift input, writes, invalidates caches | ✅ Lines 69–114 exactly as described |
| `assertPasses`, `buildGiftInput`, `invalidateImportCaches` are private helpers of the service | ✅ Lines 137–200 |
| Usecase convention on sales (`updateSale`, `ungiftSale`, `deleteSale`) | ✅ Three colocated folders, each with `*.usecase.ts` + `*.usecase.db.ts` + own `*.usecase.module.ts` (PSG-24, PR #44) + two spec files |
| Call direction controller → service → usecase → usecase db | ✅ `SalesController` → `SalesService` → `*Usecase.execute(...)` (e.g. `sales.service.ts:123–137`) |
| **`assertPasses` is used by `preview` too** | ⚠️ **Yes — line 53. It cannot move into the commit usecase wholesale without breaking `preview`.** |
| **`invalidateImportCaches` is used by `revert` too** | ⚠️ **Yes — line 120. Same problem.** |
| `buildGiftInput` is commit-only | ✅ Sole caller is `commit` (line 96) |

The two ⚠️ rows are the ticket's main ambiguity: the issue says all three helpers "move with it", but two of them are shared with methods that stay on the service. D3 resolves this.

## Non-goals

- Extracting `preview` or `revert` into their own usecases. Only `commit` moves; `revert` extraction is an obvious follow-up if desired, not part of this change.
- Changing `src/db/sales-import/*` (`SalesImportDb`, its interface, its module) — unchanged.
- Changing the resolver (`validateCommitRows` / `resolveDraftRows`), CSV parser, DTOs, controller routes, cache keys, error codes, or API shapes.
- Frontend changes. None exist — confirmed backend-only.

## Design decisions

### D1 — Register the usecase via a colocated `commit-sales-import.usecase.module.ts` (one module per usecase)

The issue says "Register the usecase as a provider in `sales-import.module.ts`", but **the user approved following PSG-24's one-module-per-usecase convention instead** (flagged alternative, approved 2026-09-22): the usecase gets its own module file in the usecase folder, and `SalesImportModule` imports it — mirroring `sales.module.ts` importing `UpdateSaleUsecaseModule` / `UngiftSaleUsecaseModule` / `DeleteSaleUsecaseModule`.

`usecases/commit-sales-import/commit-sales-import.usecase.module.ts`:

```ts
@Module({
    imports: [MatchesDbModule, SeasonPassesDbModule, RedisModule, SalesImportDbModule],
    providers: [
        { provide: ICommitSalesImportUsecaseDb, useClass: CommitSalesImportUsecaseDb },
        { provide: ICommitSalesImportUsecase, useClass: CommitSalesImportUsecase },
        ImportPassesValidator,
        ImportCacheInvalidator,
    ],
    exports: [ICommitSalesImportUsecase],
})
export class CommitSalesImportUsecaseModule {}
```

- The four imported modules are the usecase graph's actual dependencies: `MatchesDbModule` + `SalesImportDbModule` (usecase db), `SeasonPassesDbModule` + `RedisModule` (shared collaborators, which are providers here exactly as `UpdateSaleUsecaseModule` provides `SaleAllocationsValidator`/`SalesCacheInvalidator`).
- No `PrismaModule` — the usecase db never talks to Prisma (D4).
- Only `ICommitSalesImportUsecase` is exported (what the service consumes), matching the sales usecase modules.

`SalesImportModule` after the change:

- `imports` gains `CommitSalesImportUsecaseModule`; its four existing entries (`MatchesDbModule`, `SeasonPassesDbModule`, `RedisModule`, `SalesImportDbModule`) **stay** — `preview` and `revert` still run in the service.
- `providers` = `[SalesImportService, ImportPassesValidator, ImportCacheInvalidator]` — the shared collaborators remain here too, since `preview`/`revert` consume them directly, exactly as `sales.module.ts` keeps its own `SaleAllocationsValidator` alongside the usecase modules.

### D2 — File layout

```
src/api/sales-import/
  usecases/commit-sales-import/
    commit-sales-import.usecase.ts          (new)  business logic — no ORM, no runtime src/db imports
    commit-sales-import.usecase.db.ts       (new)  the folder's only db file, scoped to commit's queries
    commit-sales-import.usecase.spec.ts     (new)
    commit-sales-import.usecase.db.spec.ts  (new)
  shared/
    import-passes.validator.ts              (new)  assertPasses, shared by preview + commit
    import-passes.validator.spec.ts         (new)
    import-cache.invalidator.ts             (new)  invalidateImportCaches, shared by commit + revert
    import-cache.invalidator.spec.ts        (new)
```

The `shared/` folder is new to this module and mirrors `src/api/sales/shared/` (`SaleAllocationsValidator`, `SalesCacheInvalidator`) — the established home for collaborators needed by more than one operation.

Tokens and classes follow the sales naming exactly: `ICommitSalesImportUsecase`/`CommitSalesImportUsecase`, `ICommitSalesImportUsecaseDb`/`CommitSalesImportUsecaseDb`, `execute(userId, dto): Promise<CommitResult>`.

### D3 — Where each of the three helpers goes

| Helper | Destination | Why |
|---|---|---|
| `buildGiftInput` | → `commit-sales-import.usecase.ts` (private) | Genuinely commit-only (sole caller line 96). Literal move, as the issue says. |
| `assertPasses` | → `shared/import-passes.validator.ts` as `ImportPassesValidator.validate(userId, selectedPassIds): Promise<SeasonYear>` | Callers are `preview` (service, line 53) **and** `commit`. Moving it into the commit usecase folder would make `preview` depend on a sibling usecase's internals — inverted, surprising coupling. A shared injectable is the exact precedent: `SaleAllocationsValidator` (read + validate, injects db tokens) is consumed by both `SalesService.addSale` and `UpdateSaleUsecase`. Body moves verbatim (throws `SEASON_PASS_NOT_FOUND`, `SEASON_PASS_FORBIDDEN`, `IMPORT_PASSES_MIXED_SEASONS`). |
| `invalidateImportCaches` | → `shared/import-cache.invalidator.ts` as `ImportCacheInvalidator.afterWrite(userId): Promise<void>` | Callers are `commit` (line 110) **and** `revert` (line 120, which stays on the service). Same reasoning; precedent is `SalesCacheInvalidator`. The long spec-D15 rationale comment (lines 126–136) moves with it, since it explains the *keys*, not the caller. Body moves verbatim: `Promise.allSettled` over accounting + recipients patterns. |

Both helpers therefore still leave `SalesImportService` (honoring "move with it") but land one level up in the module's `shared/` so `preview`/`revert` keep a single source of truth instead of a duplicated copy. **This is the spec's main deviation from the issue's literal wording — flagged for approval (D7).**

### D4 — `commit-sales-import.usecase.db.ts` wraps the existing db tokens behind a narrow abstract — it does not talk to Prisma

```ts
export abstract class ICommitSalesImportUsecaseDb {
    abstract getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]>;
    abstract bulkCreate(payload: {
        userId: UserId;
        batchId: string;
        sales: BulkSaleInput[];
    }): Promise<number>;
}
```

The implementation injects `IMatchesDbService`, `ISalesImportDbService`, and delegates 1:1 — nothing more. Specifically:

- **`deleteBatch` is not exposed** — that is the issue's "not the module's full `SalesImportDbService` surface". The usecase sees exactly the two queries `commit` runs.
- **It does not inject `PrismaService` or import `@prisma/client` at all.** Re-implementing `bulkCreate` against Prisma would duplicate the tested bulk transaction in `src/db/sales-import/sales-import.db.ts:18–84` (sales + allocations + gift + recipient resolution + sales-cache invalidation) — the single worst possible outcome of this refactor. Every query `commit` needs already exists behind a db token; `SalesImportDb` and friends remain the only files importing the ORM, so the issue's intent — *ORM access confined to the folder's db file; usecase business logic ORM-free* — holds a fortiori. (Flagged as a wording nuance in D7.)
- Type-only imports from `src/db` (e.g. `BulkSaleGiftInput` in the usecase, `Match` in the db file) are legal and erased at compile time — same as `sales-import.service.ts` today.

Post-refactor `sales-import.module.ts` gains only the `CommitSalesImportUsecaseModule` import (D1), and `app.module.spec.ts` (full DI compile) proves the graph resolves.

### D5 — The pipeline is copied verbatim; the conditional invalidation stays in `usecase.ts`

`CommitSalesImportUsecase.execute` runs, in order, exactly what `commit` runs today:

1. `seasonStartYear = await this.passesValidator.validate(userId, dto.selectedPassIds)`
2. `homeMatches = await this.db.getHomeMatchesForSeason(seasonStartYear)`
3. `validateCommitRows({ rows: dto.rows, homeMatches, selectedPassIds: dto.selectedPassIds })`; `errors > 0` → `DomainException(ErrorCode.IMPORT_ROWS_INVALID)`
4. `batchId = randomUUID()`; map rows → `BulkSaleInput[]` (profit via `computeProfit`, `soldAt` noon-UTC only for `SOLD`, allocations, `gift: buildGiftInput(row, matchDates)`) — `buildGiftInput` moves in as a private method with its comment
5. `salesCreated = await this.db.bulkCreate({ userId, batchId, sales })`
6. `if (salesCreated > 0) await this.cacheInvalidator.afterWrite(userId)`
7. `return { batchId, salesCreated }`

Steps 5–7 are the one ordering nuance. PSG-16 D2 said "cache invalidation lives in the usecase db layer" (as in `ungift-sale.usecase.db.ts`), but the newer `update-sale` extraction — cited first in PSG-26's convention list — injects `SalesCacheInvalidator` into `usecase.ts` and calls it there. The issue's own scoping ("the db file … scoped to exactly the **queries** this usecase needs") tips it: invalidation is not a query. So `usecase.db` stays a pure two-method query wrapper, and the `salesCreated > 0` conditional lives in `execute`, byte-identical to today's `commit`. Newer precedent + explicit issue wording wins over PSG-16 D2.

`randomUUID` (batch id) is a business decision of this operation and moves with it.

### D6 — `SalesImportService` after the change

```ts
async commit(userId: UserId, dto: CommitRequestDto): Promise<CommitResult> {
    return this.commitSalesImportUsecase.execute(userId, dto);
}
```

- `preview` swaps `this.assertPasses(...)` for `this.passesValidator.validate(...)`; everything else unchanged.
- `revert` swaps `this.invalidateImportCaches(...)` for `this.cacheInvalidator.afterWrite(...)`; everything else unchanged.
- Constructor **shrinks**: drops `ISeasonPassesDbService` (only `assertPasses` used it) and `RedisService` (only `invalidateImportCaches` used it); keeps `IMatchesDbService` (preview), `ISalesImportDbService` (revert), and gains `ICommitSalesImportUsecase`, `ImportPassesValidator`, `ImportCacheInvalidator`.
- `buildGiftInput`, `assertPasses`, `invalidateImportCaches` and their long comments are gone from the file.
- `CommitResult` is **defined** in `commit-sales-import.usecase.ts` and **re-exported** from `sales-import.service.ts` (`export type { CommitResult } from './usecases/...'`), so `sales-import.controller.ts:19` (`import { SalesImportService, CommitResult }`) stays untouched. The service must not define it: a usecase importing its caller's types would invert the call direction.

Call direction after the change — the issue's stated chain, verified end-to-end:

```
SalesImportController
  → SalesImportService            (thin: commit delegate; preview/revert use shared collaborators)
    → CommitSalesImportUsecase.execute(userId, dto)
      → ImportPassesValidator.validate(...)             → ISeasonPassesDbService   [shared]
      → ICommitSalesImportUsecaseDb.getHomeMatches...   → IMatchesDbService
      → validateCommitRows(...)                         (pure, unchanged)
      → ICommitSalesImportUsecaseDb.bulkCreate(...)     → ISalesImportDbService
      → ImportCacheInvalidator.afterWrite(...)          → RedisService             [shared]
```

No cycles: `usecase.ts` imports only its db token, the two shared collaborators, DTOs, and pure utils; `shared/*` import only db tokens + Redis; `usecase.db.ts` imports db tokens only.

### D7 — Open questions resolved on judgment (flagged for user approval)

1. **Registration (D1)** — initially planned per the issue's literal instruction (providers inline in `sales-import.module.ts`); **user decided: one module per usecase** → a colocated `commit-sales-import.usecase.module.ts` per PSG-24, imported by `sales-import.module.ts`. Resolved 2026-09-22.
2. **`assertPasses` / `invalidateImportCaches` land in `shared/`, not inside the usecase folder (D3)** — the issue says they "move with it", but `preview` (line 53) and `revert` (line 120) still need them. Literal compliance would mean either duplicated copies or `preview` importing a sibling usecase's internals; both were rejected in favor of the `sales/shared/` precedent. Approve or choose duplication instead.
3. **Usecase db wraps existing db tokens rather than importing Prisma (D4)** — the issue calls it "the only file in the usecase folder that imports the ORM"; ours imports no ORM at all because wrapping is the only way to avoid duplicating the `bulkCreate` transaction. The scoping requirement (narrow abstract, no `deleteBatch`) is met exactly. Approve the wording-level deviation.
4. **Conditional invalidation in `usecase.ts`, not `usecase.db` (D5)** — resolves PSG-16 D2 vs. the newer `update-sale` precedent in favor of the latter plus the issue's "queries only" scoping.
5. **Names** — `ImportPassesValidator.validate(...)`, `ImportCacheInvalidator.afterWrite(...)`, tokens `ICommitSalesImportUsecase`/`ICommitSalesImportUsecaseDb`. Mirror the sales names; trivially renameable.

## Test strategy

Behavior is unchanged, so every existing assertion must survive in a new home. The 12 tests in `sales-import.service.spec.ts`'s `commit` block (lines 136–419) move to the usecase spec; the 4 `preview` and 4 `revert` tests stay, re-pointed at the real shared collaborators.

### New test files

| File | What it tests |
|---|---|
| `usecases/commit-sales-import/commit-sales-import.usecase.spec.ts` | Full-pipeline tests in the service spec's existing style: mocked `ICommitSalesImportUsecaseDb`, **real** `ImportPassesValidator` over mocked `ISeasonPassesDbService`, **real** `ImportCacheInvalidator` over mocked `RedisService` — so the ported assertions (exact `bulkCreate` payloads, exact `CACHE_KEYS.invalidateAccounting/Recipients` calls) survive verbatim. Covers: fresh `batchId` + `salesCreated` passthrough; `bulkCreate` called once with correctly shaped payload; `soldAt` noon-UTC for SOLD / `null` otherwise; gift input (recipient normalized, `giftedAt` pinned noon, match-date fallback, `soldAt: null` for GIFTED); `IMPORT_ROWS_INVALID` when `validateCommitRows` reports errors; server-side re-resolution of `matchId` (tampered date rejected, foreign client `matchId` ignored); validator errors propagate (`SEASON_PASS_*`); invalidation called only when `salesCreated > 0`. |
| `usecases/commit-sales-import/commit-sales-import.usecase.db.spec.ts` | Delegation only: `getHomeMatchesForSeason` passes the season year through to `IMatchesDbService`; `bulkCreate` forwards `{userId, batchId, sales}` unchanged; `deleteBatch` is not reachable from this surface (compile-time by construction — TS enforces it; one explicit `not.toHaveProperty` guard test documents the intent). |
| `shared/import-passes.validator.spec.ts` | The three `assertPasses` cases, now first-class: `SEASON_PASS_NOT_FOUND` (previously untested!), `SEASON_PASS_FORBIDDEN`, `IMPORT_PASSES_MIXED_SEASONS`; returns the single `SeasonYear` on success. |
| `shared/import-cache.invalidator.spec.ts` | Invalidates both `invalidateAccounting(userId)` and `invalidateRecipients(userId)` patterns; a rejected pattern does not propagate (verbatim `Promise.allSettled` semantics). |

### Modified test files

| File | Change |
|---|---|
| `src/api/sales-import/sales-import.service.spec.ts` | `preview` block: drop the direct `ISeasonPassesDbService` provider, provide the **real** `ImportPassesValidator` over a mocked passes db so the `SEASON_PASS_FORBIDDEN` / `MIXED_SEASONS` assertions survive unchanged. `revert` block: provide the **real** `ImportCacheInvalidator` over mocked `RedisService` so its invalidation assertions survive unchanged. `commit` block (12 tests): replaced by one thin-delegation test — mock `ICommitSalesImportUsecase`, assert `execute` called with `(userId, validDto)` and its result returned verbatim. |

### Unchanged test files

`sales-import.csv.spec.ts`, `sales-import.resolver.spec.ts`, `src/db/sales-import/sales-import.db.spec.ts`, `src/app.module.spec.ts` (load-bearing: full DI compile catches a forgotten provider), all sales-module specs.

Net: 12 tests migrate + ~8 new (validator NOT_FOUND, invalidator semantics, delegation, db passthrough) — same scenarios, plus two previously untested paths.

## Files affected

### Created

| File | Purpose |
|---|---|
| `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.ts` | `CommitSalesImportUsecase` + `ICommitSalesImportUsecase` + `CommitResult`; pipeline, `buildGiftInput` (moved) |
| `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.db.ts` | `CommitSalesImportUsecaseDb` + `ICommitSalesImportUsecaseDb` — two-method query wrapper |
| `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.spec.ts` | Business-logic tests (ported from service spec) |
| `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.db.spec.ts` | Db-delegation tests |
| `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.module.ts` | One-module-per-usecase registration: usecase pair + shared collaborators, exports `ICommitSalesImportUsecase` (D1) |
| `src/api/sales-import/shared/import-passes.validator.ts` | `assertPasses` moved verbatim, injectable |
| `src/api/sales-import/shared/import-passes.validator.spec.ts` | Pass validation tests |
| `src/api/sales-import/shared/import-cache.invalidator.ts` | `invalidateImportCaches` moved verbatim + D15 comment |
| `src/api/sales-import/shared/import-cache.invalidator.spec.ts` | Cache invalidation tests |

### Modified

| File | Change |
|---|---|
| `src/api/sales-import/sales-import.service.ts` | `commit` → one-line delegate; `preview`/`revert` use shared collaborators; three private helpers + `seasonPassesDb`/`redisService` deps removed; `CommitResult` re-exported |
| `src/api/sales-import/sales-import.module.ts` | `imports` gains `CommitSalesImportUsecaseModule` (existing four stay); `providers` gains the two shared collaborators (Tasks 1–2); usecase pair lives in the usecase module |
| `src/api/sales-import/sales-import.service.spec.ts` | Per test strategy above |

### Unchanged

`sales-import.controller.ts` (incl. its `CommitResult` import), `sales-import.resolver.ts`, `sales-import.csv.ts`, all DTOs, everything under `src/db/`, `src/redis/`, `.dependency-cruiser.cjs`, everything under `web/`, all docs except this spec and its plan.

Dependency-cruiser: no config change needed — `no-orm-outside-db` / `no-prisma-service-outside-db` are satisfied trivially (no new ORM edges); `no-orphans` stays clean because every new file is imported in the same change that creates it.

## Verification

Every phase runs the full gate (house convention, PSG-16/PSG-24):

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```

Load-bearing checks:

- 