# PSG-24: Split ungiftSale and deleteSale each into their own usecase module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of `UngiftSaleUsecase` and `DeleteSaleUsecase` its own colocated Nest module and delete the shared `sales-usecases.module.ts`, with zero runtime change.

**Architecture:** Two new `<name>.usecase.module.ts` files, colocated next to their usecases, each importing exactly `PrismaModule` + `RedisModule` (the only modules their `*UsecaseDb` classes need) and exporting only their `I<Name>Usecase` token. `sales.module.ts` imports them directly; the shared module is deleted in the same commit.

**Tech Stack:** NestJS 12 modules/DI, TypeScript, Vitest, dependency-cruiser, ESLint, tsc.

**Spec:** `docs/specs/2026-09-22-psg-24-usecase-module-split-design.md`

## Global Constraints

- Backend-only: no file under `web/` may change.
- No runtime, API, cache-key, or test-contract change — the diff is wiring only.
- Each new module imports **exactly** `PrismaModule` and `RedisModule` — no other db modules (spec D2).
- Each new module exports **only** `I<Name>Usecase` — never the Db token (spec D3).
- Module class names: `UngiftSaleUsecaseModule`, `DeleteSaleUsecaseModule` (mirroring `UpdateSaleUsecaseModule` on branch `psg-17`).
- Files not listed under "Files" must not be modified (`sales.service.ts`, `sales.controller.ts`, `sales.service.spec.ts`, usecase/db files, `scripts/ungift-sale.ts`).
- Full gate must pass before completion: `npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js`.
- Formatting: 4-space indent, single quotes (match neighboring files / `npm run format`).

---

### Task 1: Create the two dedicated usecase modules and rewire `SalesModule` (delete the shared module)

All four file changes must land together: deleting or unwiring the shared module before its providers are registered elsewhere breaks `src/app.module.spec.ts` (full DI compile), and leaving it behind after the rewire makes it an orphan for dep-cruiser. One task, one test cycle, one commit.

**Files:**
- Create: `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.module.ts`
- Create: `src/api/sales/usecases/delete-sale/delete-sale.usecase.module.ts`
- Modify: `src/api/sales/sales.module.ts`
- Delete: `src/api/sales/usecases/sales-usecases.module.ts`
- Test (existing, must stay green): `src/app.module.spec.ts`, `src/api/sales/sales.service.spec.ts`, `src/api/sales/usecases/**/*.spec.ts`

**Interfaces:**
- Consumes (all already exist, unchanged): `PrismaModule` (`src/db/prisma.module.ts`, exports `PrismaService`), `RedisModule` (`src/redis/redis.module.ts`, exports `RedisService`), tokens `IUngiftSaleUsecase`/`IUngiftSaleUsecaseDb` from `./ungift-sale.usecase(.db)`, tokens `IDeleteSaleUsecase`/`IDeleteSaleUsecaseDb` from `./delete-sale.usecase(.db)`.
- Produces: exports `UngiftSaleUsecaseModule` (from `ungift-sale.usecase.module.ts`) and `DeleteSaleUsecaseModule` (from `delete-sale.usecase.module.ts`), each exporting its `I<Name>Usecase` token. `sales.module.ts` imports both. `SalesService`'s constructor (`IUngiftSaleUsecase`, `IDeleteSaleUsecase`) resolves unchanged.

- [ ] **Step 1: Create `ungift-sale.usecase.module.ts`**

```ts
// src/api/sales/usecases/ungift-sale/ungift-sale.usecase.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../db/prisma.module';
import { RedisModule } from '../../../../redis/redis.module';
import { IUngiftSaleUsecase, UngiftSaleUsecase } from './ungift-sale.usecase';
import {
    IUngiftSaleUsecaseDb,
    UngiftSaleUsecaseDb,
} from './ungift-sale.usecase.db';

@Module({
    imports: [PrismaModule, RedisModule],
    providers: [
        { provide: IUngiftSaleUsecaseDb, useClass: UngiftSaleUsecaseDb },
        { provide: IUngiftSaleUsecase, useClass: UngiftSaleUsecase },
    ],
    exports: [IUngiftSaleUsecase],
})
export class UngiftSaleUsecaseModule {}
```

- [ ] **Step 2: Create `delete-sale.usecase.module.ts`**

```ts
// src/api/sales/usecases/delete-sale/delete-sale.usecase.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../db/prisma.module';
import { RedisModule } from '../../../../redis/redis.module';
import { IDeleteSaleUsecase, DeleteSaleUsecase } from './delete-sale.usecase';
import {
    IDeleteSaleUsecaseDb,
    DeleteSaleUsecaseDb,
} from './delete-sale.usecase.db';

@Module({
    imports: [PrismaModule, RedisModule],
    providers: [
        { provide: IDeleteSaleUsecaseDb, useClass: DeleteSaleUsecaseDb },
        { provide: IDeleteSaleUsecase, useClass: DeleteSaleUsecase },
    ],
    exports: [IDeleteSaleUsecase],
})
export class DeleteSaleUsecaseModule {}
```

- [ ] **Step 3: Rewire `sales.module.ts`**

Replace the `SalesUsecasesModule` import with the two new module imports, and swap it in the `imports` array. The result:

```ts
// src/api/sales/sales.module.ts
import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesDbModule } from '../../db/sales/sales.db.module';
import { MatchesDbModule } from '../../db/matches/matches.db.module';
import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { RecipientsDbModule } from '../../db/recipients/recipients.db.module';
import { RedisModule } from '../../redis/redis.module';
import { ISalesService } from './interfaces/sales.service.interface';
import { UngiftSaleUsecaseModule } from './usecases/ungift-sale/ungift-sale.usecase.module';
import { DeleteSaleUsecaseModule } from './usecases/delete-sale/delete-sale.usecase.module';

@Module({
    imports: [
        SalesDbModule,
        MatchesDbModule,
        SeasonPassesDbModule,
        RecipientsDbModule,
        RedisModule,
        UngiftSaleUsecaseModule,
        DeleteSaleUsecaseModule,
    ],
    controllers: [SalesController],
    providers: [{ provide: ISalesService, useClass: SalesService }],
})
export class SalesModule {}
```

Only the import line and the imports array change; everything else stays byte-for-byte.

- [ ] **Step 4: Delete the shared module**

```bash
git rm src/api/sales/usecases/sales-usecases.module.ts
```

(If `git rm` is unavailable in the environment, delete the file with the editor tool; it must be gone before the gate runs so dep-cruiser's `no-orphans` rule stays clean.)

- [ ] **Step 5: Verify no stray references remain**

Run: `grep -rn "sales-usecases\|SalesUsecasesModule" src scripts`
Expected: no output.

- [ ] **Step 6: Run the full gate**

Run: `npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js && echo GATE_OK`
Expected: `GATE_OK`. Critically:
- `src/app.module.spec.ts` ("resolves every provider") PASSES — this is the check that would catch a missing `RedisModule`/`PrismaModule` import in either new module.
- `lint:deps` reports no errors (Prisma-import rules exempt `*.module.ts`; no orphans).
- All usecase specs and `sales.service.spec.ts` pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/api/sales/usecases/ungift-sale/ungift-sale.usecase.module.ts \
        src/api/sales/usecases/delete-sale/delete-sale.usecase.module.ts \
        src/api/sales/sales.module.ts
git add -u src/api/sales/usecases/sales-usecases.module.ts
git commit -m "refactor(sales): give ungiftSale and deleteSale their own usecase modules (PSG-24)"
```
