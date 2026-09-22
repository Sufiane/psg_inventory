# Split `ungiftSale` and `deleteSale` each into their own usecase module — Design

**Date:** 2026-09-22
**Status:** Draft
**Issue:** PSG-24
**Type:** Backend-only refactor. Net-zero at runtime. No API, behavior, or test-contract change.

## Problem

`src/api/sales/usecases/sales-usecases.module.ts` (landed in PSG-16, PR #34) registers two unrelated usecases — `UngiftSaleUsecase`/`UngiftSaleUsecaseDb` and `DeleteSaleUsecase`/`DeleteSaleUsecaseDb` — together in one shared Nest module. A shared module means:

- Nest instantiates **both** usecases' full dependency graphs whenever either one is needed.
- Editing one usecase's wiring means touching a file two unrelated usecases depend on.

The project convention (established when `updateSale` was extracted, branch `psg-17`) is that **each usecase owns its own module**: `<name>.usecase.module.ts`, colocated next to `<name>.usecase.ts`, importing exactly the db modules it needs, registering its own providers, exporting only its `I<Name>Usecase` token.

## Verified repo state (ticket assumptions checked against this branch)

| Assumption | Verified |
|---|---|
| Shared module registers all 4 providers, imports `PrismaModule`+`RedisModule`, exports both usecase tokens | ✅ Exactly as the ticket describes |
| `UngiftSaleUsecaseDb` deps | ✅ Injects `PrismaService` + `RedisService` only → `PrismaModule` + `RedisModule` |
| `DeleteSaleUsecaseDb` deps | ✅ Injects `PrismaService` + `RedisService` only → `PrismaModule` + `RedisModule` |
| Usecase classes (`UngiftSaleUsecase`, `DeleteSaleUsecase`) depend only on their own `I<Name>UsecaseDb` token | ✅ Registered in the same module → resolvable without exporting the Db token |
| `sales.module.ts` is the sole importer of `SalesUsecasesModule` | ✅ Only reference in `src/`, `scripts/`, `web/` is `sales.module.ts` |
| Reference `src/api/sales/usecases/update-sale/update-sale.usecase.module.ts` | ⚠️ **Not on `main`** — the `updateSale` extraction is in-flight on branch `psg-17` (commit `c686685`). Its module shape was read from that branch and matches the ticket's description exactly (imports `PrismaModule`, `RedisModule`, `SalesDbModule`, `RecipientsDbModule`, `MatchesDbModule`, `SeasonPassesDbModule`; registers Db + usecase providers; exports only `IUpdateSaleUsecase`). Usable as the reference shape. |

### Merge-order note (PSG-17 ↔ PSG-24)

`psg-17` adds `UpdateSaleUsecaseModule` to `sales.module.ts` but **keeps** the shared module (it still hosts ungift/delete there). PSG-24 deletes the shared module. Whichever merges second resolves a trivial conflict in `sales.module.ts`'s import list; the union of both branches is exactly the intended end state — three dedicated usecase modules, no shared module. No coordination beyond ordinary conflict resolution is needed.

## Non-goals

- Extracting `addSale`, `giftSale`, `updateGift`, or the read path.
- Any change to `SalesService`, `SalesController`, `scripts/ungift-sale.ts`, cache keys, or API behavior.
- Touching `docs/specs/2026-09-20-psg-16-…` (historical record, left as-is).
- Frontend changes. None exist — confirmed backend-only.

## Design decisions

### D1 — One module per usecase, colocated, named after the usecase class

```
src/api/sales/usecases/
  ungift-sale/
    ungift-sale.usecase.ts            (existing)
    ungift-sale.usecase.db.ts         (existing)
    ungift-sale.usecase.module.ts     (new)  → class UngiftSaleUsecaseModule
  delete-sale/
    delete-sale.usecase.ts            (existing)
    delete-sale.usecase.db.ts         (existing)
    delete-sale.usecase.module.ts     (new)  → class DeleteSaleUsecaseModule
  sales-usecases.module.ts            (deleted)
```

Class naming mirrors the reference `UpdateSaleUsecaseModule` on `psg-17`.

### D2 — Each new module imports exactly `PrismaModule` + `RedisModule`

Both `*UsecaseDb` classes inject only `PrismaService` and `RedisService`; nothing else. Importing `SalesDbModule` or other db modules would reintroduce the "instantiates more than needed" problem the ticket is fixing.

This is legal under dependency-cruiser: the `no-prisma-service-outside-db` rule exempts `*.module.ts` files from its `from.pathNot` list (comment: *"Usecase modules are exempt because they wire PrismaModule into usecase-db providers that own their own transactions"*), and `no-orm-outside-db` only forbids `@prisma/client` imports (none here).

### D3 — Export only `I<Name>Usecase`

`UngiftSaleUsecase`/`DeleteSaleUsecase` receive their `I<Name>UsecaseDb` by constructor injection from the **same** module's provider registry, so the Db tokens stay module-internal. Only the usecase tokens cross the module boundary — that's all `SalesService` needs.

### D4 — Delete `sales-usecases.module.ts` and rewire `sales.module.ts` atomically

`SalesUsecasesModule` has no other importer and no other contents after the split. The rewire (remove `SalesUsecasesModule` import, add the two new modules) and the file deletion land in the same change so the dep-cruiser `no-orphans` rule (warn severity) never sees an unimported leftover. All other imports in `sales.module.ts` (`SalesDbModule`, `MatchesDbModule`, `SeasonPassesDbModule`, `RecipientsDbModule`, `RedisModule`) stay — they feed `SalesService` itself.

### D5 — No consumer changes

`SalesService`'s constructor (`IUngiftSaleUsecase`, `IDeleteSaleUsecase`), `sales.service.spec.ts` (explicit `Test.createTestingModule` providers), the controller, and `scripts/ungift-sale.ts` (resolves `ISalesService` from `AppModule`) are all unchanged: the same tokens are exported from the modules `SalesModule` now imports directly.

## Files affected

| File | Change |
|---|---|
| `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.module.ts` | **Create** — imports `PrismaModule`, `RedisModule`; provides `IUngiftSaleUsecaseDb`→`UngiftSaleUsecaseDb`, `IUngiftSaleUsecase`→`UngiftSaleUsecase`; exports `IUngiftSaleUsecase` |
| `src/api/sales/usecases/delete-sale/delete-sale.usecase.module.ts` | **Create** — same shape for `DeleteSaleUsecase` |
| `src/api/sales/sales.module.ts` | **Modify** — import the two new modules instead of `SalesUsecasesModule` |
| `src/api/sales/usecases/sales-usecases.module.ts` | **Delete** |

Unchanged: `sales.service.ts`, `sales.controller.ts`, `sales.service.spec.ts`, all usecase/db/spec files, `scripts/ungift-sale.ts`, everything under `web/`.

## Verification

Full gate (per PSG-16 convention):

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```

Load-bearing checks:

- **`src/app.module.spec.ts`** compiles the entire DI graph — a missing `imports` entry in either new module (e.g. forgetting `RedisModule`) makes this fail with an unresolved dependency.
- **`npm run lint:deps`** enforces D2 (Prisma rules) and confirms no orphaned file survives D4.
- No new tests are written: this is pure wiring, and the existing suite (`app.module.spec.ts`, usecase specs, `sales.service.spec.ts`) already covers the graph and the behavior. A green suite is the expected result.
