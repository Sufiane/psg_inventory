# CSV Sales Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a CSV sales-import feature: a modal where a user picks/creates season passes, uploads a CSV of sales, reviews an annotated draft, then commits the batch (with one-click undo).

**Architecture:** NestJS backend gains a new `sales-import` module with a two-endpoint preview/commit flow + an idempotent revert. Backend is hex-split into an API-side business service and a DB-side Prisma service (following existing project convention — see "Layout note" below). SvelteKit frontend adds a three-step modal reachable from both the season page and the global sales page. CSV parsing uses `papaparse` server-side; drafts are held only in the browser between preview and commit.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL, papaparse (new dep), SvelteKit 2, Svelte 5, Tailwind 4, Jest, jest-mock-extended, class-validator.

**Layout note.** The spec's file table places `sales-import.db.ts` next to the API service under `src/api/sales/import/`. The project convention (see `src/api/sales/sales.service.ts` + `src/db/sales/sales.service.ts` + `DbModule`) is to keep every Prisma-touching service in `src/db/<module>/` behind an abstract interface, wired centrally in `DbModule`. This plan follows the project convention. The `service` layer in `src/api/sales/import/` still imports only the abstract `ISalesImportDbService`, so the hex boundary the spec calls for is preserved — only the folder placement differs.

---

## File structure

**New backend files:**

- `src/db/sales-import/sales-import.db.interface.ts` — abstract `ISalesImportDbService` (bulk-create sales, delete batch).
- `src/db/sales-import/sales-import.service.ts` — Prisma implementation. Only file in the module that touches Prisma.
- `src/api/sales/import/dto/preview-request.dto.ts` — `selectedPassIds` field for multipart body.
- `src/api/sales/import/dto/draft-row.dto.ts` — one row after resolution.
- `src/api/sales/import/dto/draft-allocation.dto.ts` — `(seasonPassId, nbTickets)` inside a draft row.
- `src/api/sales/import/dto/commit-request.dto.ts` — `{ selectedPassIds, rows: DraftRowDto[] }`.
- `src/api/sales/import/dto/preview-response.dto.ts` — response shape (rows + summary + missingMatches + seasonStartYear).
- `src/api/sales/import/dto/delete-batch.dto.ts` — `batchId` param validator.
- `src/api/sales/import/sales-import.csv.ts` — `parseImportCsv(buffer)` pure function using papaparse; separates parsing from orchestration.
- `src/api/sales/import/sales-import.resolver.ts` — pure functions for match resolution + default allocation + coverage (dependency-free, easy to unit-test).
- `src/api/sales/import/sales-import.service.ts` — orchestrates parser, resolver, DB service. No Prisma import.
- `src/api/sales/import/sales-import.service.spec.ts` — Jest unit tests, mocks the DB services.
- `src/api/sales/import/sales-import.controller.ts` — three routes.
- `src/api/sales/import/sales-import.module.ts` — wires controller + service + interface binding + `DbModule` import.

**Modified backend files:**

- `src/prisma/schema.prisma` — add `importBatchId` field + index on `Sales`.
- `src/db/matches/matches.db.interface.ts` — add `getHomeMatchesForSeason(seasonStartYear)`.
- `src/db/matches/matches.service.ts` — implement it.
- `src/db/db.module.ts` — register `ISalesImportDbService` provider + export.
- `src/app.module.ts` — import new `SalesImportModule`.
- `package.json` (root) — add `papaparse` + `@types/papaparse` at exact-pinned versions.

**New frontend files:**

- `web/src/lib/ui/ImportModal.svelte` — three-step modal.
- `web/src/lib/ui/ImportModalStepPasses.svelte` — step 1.
- `web/src/lib/ui/ImportModalStepUpload.svelte` — step 2.
- `web/src/lib/ui/ImportModalStepReview.svelte` — step 3.
- `web/src/lib/ui/ImportDraftTable.svelte` — draft rows table with inline editors.
- `web/src/lib/ui/ImportMissingMatchesPanel.svelte` — missing-match nudge list.
- `web/src/lib/import-api.ts` — thin client wrapping `/sales/import/preview`, `/commit`, `/:batchId`.
- `web/src/lib/types-import.ts` — DraftRow / PreviewResponse types matching backend DTOs.

**Modified frontend files:**

- `web/src/routes/(app)/sales/+page.svelte` — add "Import sales" button.
- `web/src/routes/(app)/season/+page.svelte` — add "Import sales" button.

---

## Task 1: Prisma schema change

**Files:**
- Modify: `src/prisma/schema.prisma` (block starting at the `Sales` model)

- [ ] **Step 1: Add `importBatchId` field + index to `Sales` model**

Locate the `Sales` model in `src/prisma/schema.prisma` and add the new field near the other scalar fields, plus an index at the bottom of the block:

```prisma
model Sales {
  // ... existing fields ...
  importBatchId String?         @map("import_batch_id")
  // ... existing relations, timestamps ...

  @@index([userId, importBatchId])
  @@map("sales")
}
```

Do not remove existing indexes or the existing `@@map("sales")`; just add the new `@@index(...)` line.

- [ ] **Step 2: Generate the migration and run it**

Run:

```bash
npx prisma migrate dev --name add_import_batch_id
```

Expected: a new folder under `src/prisma/migrations/` (e.g. `20260620xxxx_add_import_batch_id/migration.sql`) containing `ALTER TABLE "sales" ADD COLUMN "import_batch_id" TEXT;` and `CREATE INDEX "sales_user_id_import_batch_id_idx" ON "sales"("user_id", "import_batch_id");`, and the client regenerates.

- [ ] **Step 3: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/prisma/schema.prisma src/prisma/migrations/
git commit -m "feat(sales-import): add import_batch_id column and index on sales"
```

---

## Task 2: Pin papaparse dependency

**Files:**
- Modify: `package.json` (root)
- Modify: `package-lock.json` (root)

- [ ] **Step 1: Install papaparse + types (they'll drop in as ranges initially)**

Run:

```bash
npm install papaparse @types/papaparse --save
```

- [ ] **Step 2: Rewrite the two entries to exact pins**

Open `package.json`. Under `dependencies`, replace any `^`/`~` prefix on the papaparse entries with the exact resolved version from `package-lock.json`. Example (versions will be whatever npm just resolved):

```json
"dependencies": {
  "...": "...",
  "papaparse": "5.5.3"
},
"devDependencies": {
  "...": "...",
  "@types/papaparse": "5.3.16"
}
```

Match the versions to those in `package-lock.json` — do not invent numbers. Move `@types/papaparse` to `devDependencies` if npm placed it in `dependencies`.

- [ ] **Step 3: Reinstall to align lock**

Run:

```bash
npm install
```

Expected: no version changes; lockfile stays as-is.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add papaparse for CSV parsing (pinned)"
```

---

## Task 3: Add `getHomeMatchesForSeason` on `IMatchesDbService`

**Files:**
- Modify: `src/db/matches/matches.db.interface.ts`
- Modify: `src/db/matches/matches.service.ts`

- [ ] **Step 1: Extend the interface**

In `src/db/matches/matches.db.interface.ts`, add the new abstract method and import `SeasonYear`:

```ts
import type { SeasonYear } from '@psg/shared/time';
// ... existing imports ...

export abstract class IMatchesDbService {
    // ... existing abstract methods ...

    abstract getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]>;
}
```

- [ ] **Step 2: Implement in the DB service**

In `src/db/matches/matches.service.ts`, add the method to the class. The season window uses August 1 → August 1 of the following year, matching `SalesService.getSeasonSales`:

```ts
async getHomeMatchesForSeason(seasonStartYear: SeasonYear): Promise<Match[]> {
    const from = new Date(seasonStartYear, 7, 1);
    const to = new Date(seasonStartYear + 1, 7, 1);

    return this.prisma.matches.findMany({
        where: {
            atHome: true,
            date: { gte: from, lt: to },
        },
        orderBy: { date: 'asc' },
        include: { Opponent: true },
    }) as unknown as Promise<Match[]>;
}
```

- [ ] **Step 3: Typecheck + lint**

Run:

```bash
npm run typecheck && npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/db/matches/
git commit -m "feat(matches): add getHomeMatchesForSeason for import coverage check"
```

---

## Task 4: `ISalesImportDbService` interface + Prisma implementation

**Files:**
- Create: `src/db/sales-import/sales-import.db.interface.ts`
- Create: `src/db/sales-import/sales-import.service.ts`

- [ ] **Step 1: Write the interface**

Create `src/db/sales-import/sales-import.db.interface.ts`:

```ts
import { SaleStatus } from '@prisma/client';
import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';

export type BulkSaleAllocationInput = {
    seasonPassId: SeasonPassId;
    nbTickets: TicketCount;
};

export type BulkSaleInput = {
    matchId: MatchId;
    listedPrice: ListedPrice;
    invest: Invest;
    profit: Profit;
    nbTickets: TicketCount;
    status: SaleStatus;
    allocations: BulkSaleAllocationInput[];
};

export abstract class ISalesImportDbService {
    abstract bulkCreate(payload: {
        userId: UserId;
        batchId: string;
        sales: BulkSaleInput[];
    }): Promise<number>;

    abstract deleteBatch(userId: UserId, batchId: string): Promise<number>;
}
```

- [ ] **Step 2: Write the Prisma implementation**

Create `src/db/sales-import/sales-import.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';
import { PrismaService } from '../prisma.service';
import { ISalesImportDbService, BulkSaleInput } from './sales-import.db.interface';

@Injectable()
export class SalesImportService implements ISalesImportDbService {
    constructor(private readonly prisma: PrismaService) {}

    async bulkCreate(payload: {
        userId: UserId;
        batchId: string;
        sales: BulkSaleInput[];
    }): Promise<number> {
        if (payload.sales.length === 0) {
            return 0;
        }

        await this.prisma.$transaction(async (tx) => {
            for (const sale of payload.sales) {
                await tx.sales.create({
                    data: {
                        userId: payload.userId,
                        matchId: sale.matchId,
                        listedPrice: sale.listedPrice,
                        invest: sale.invest,
                        profit: sale.profit,
                        nbTickets: sale.nbTickets,
                        status: sale.status,
                        importBatchId: payload.batchId,
                        Allocations: {
                            create: sale.allocations.map((allocation) => ({
                                seasonPassId: allocation.seasonPassId,
                                nbTickets: allocation.nbTickets,
                            })),
                        },
                    },
                });
            }
        });

        return payload.sales.length;
    }

    async deleteBatch(userId: UserId, batchId: string): Promise<number> {
        const targets = await this.prisma.sales.findMany({
            where: { userId, importBatchId: batchId },
            select: { id: true },
        });

        if (targets.length === 0) {
            return 0;
        }

        const saleIds = targets.map((sale) => sale.id);

        await this.prisma.$transaction([
            this.prisma.saleHistories.deleteMany({
                where: { saleId: { in: saleIds } },
            }),
            this.prisma.salePassAllocations.deleteMany({
                where: { saleId: { in: saleIds } },
            }),
            this.prisma.sales.deleteMany({
                where: { userId, importBatchId: batchId },
            }),
        ]);

        return targets.length;
    }
}
```

`bulkCreate` iterates inside a single `$transaction` so nested `create` (sale + allocations) works cleanly; `createMany` cannot express nested writes. `deleteBatch` mirrors the existing `SalesService.deleteSale` cascade (histories + allocations + sale).

- [ ] **Step 3: Wire into `DbModule`**

Open `src/db/db.module.ts`. Add the import, provider, and export:

```ts
import { ISalesImportDbService } from './sales-import/sales-import.db.interface';
import { SalesImportService } from './sales-import/sales-import.service';

@Module({
    providers: [
        // ... existing providers ...
        { provide: ISalesImportDbService, useClass: SalesImportService },
    ],
    exports: [
        // ... existing exports ...
        ISalesImportDbService,
    ],
})
export class DbModule {}
```

- [ ] **Step 4: Typecheck + lint**

Run:

```bash
npm run typecheck && npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/sales-import/ src/db/db.module.ts
git commit -m "feat(sales-import): add bulk-create and batch-delete Prisma service"
```

---

## Task 5: DTOs for preview, commit, delete

**Files:**
- Create: `src/api/sales/import/dto/preview-request.dto.ts`
- Create: `src/api/sales/import/dto/draft-allocation.dto.ts`
- Create: `src/api/sales/import/dto/draft-row.dto.ts`
- Create: `src/api/sales/import/dto/commit-request.dto.ts`
- Create: `src/api/sales/import/dto/preview-response.dto.ts`
- Create: `src/api/sales/import/dto/delete-batch.dto.ts`

- [ ] **Step 1: `PreviewRequestDto`**

```ts
// src/api/sales/import/dto/preview-request.dto.ts
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class PreviewRequestDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('4', { each: true })
    selectedPassIds!: string[];
}
```

- [ ] **Step 2: `DraftAllocationDto`**

```ts
// src/api/sales/import/dto/draft-allocation.dto.ts
import { IsInt, IsUUID, Min } from 'class-validator';

export class DraftAllocationDto {
    @IsUUID('4')
    seasonPassId!: string;

    @IsInt()
    @Min(1)
    nbTickets!: number;
}
```

- [ ] **Step 3: `DraftRowDto`**

```ts
// src/api/sales/import/dto/draft-row.dto.ts
import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Min,
    ValidateNested,
} from 'class-validator';
import { DraftAllocationDto } from './draft-allocation.dto';

export const DRAFT_ROW_STATUSES = [
    'ok',
    'warn:opponent-mismatch',
    'warn:multi-ticket-single-pass',
    'error:match-missing',
    'error:opponent-not-found',
    'error:unallocated',
    'error:invalid-cell',
] as const;

export type DraftRowStatus = (typeof DRAFT_ROW_STATUSES)[number];

export class DraftRowDto {
    @IsInt()
    @Min(0)
    rowIndex!: number;

    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    date!: string;

    @IsString()
    opponent!: string;

    @IsInt()
    @Min(0)
    listedPrice!: number;

    @IsInt()
    @Min(1)
    nbTickets!: number;

    @IsInt()
    @Min(0)
    invest!: number;

    @IsIn(['PENDING', 'SOLD', 'CANCELLED'])
    status!: 'PENDING' | 'SOLD' | 'CANCELLED';

    @IsOptional()
    @IsUUID('4')
    matchId?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DraftAllocationDto)
    allocations!: DraftAllocationDto[];

    @IsIn(DRAFT_ROW_STATUSES)
    rowStatus!: DraftRowStatus;
}
```

Note: also add `import { IsUUID } from 'class-validator';` at the top; the snippet omits it for brevity — include it in the file.

- [ ] **Step 4: `CommitRequestDto`**

```ts
// src/api/sales/import/dto/commit-request.dto.ts
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { DraftRowDto } from './draft-row.dto';

export class CommitRequestDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('4', { each: true })
    selectedPassIds!: string[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DraftRowDto)
    rows!: DraftRowDto[];
}
```

- [ ] **Step 5: `PreviewResponseDto` (interface only, response shape)**

```ts
// src/api/sales/import/dto/preview-response.dto.ts
import { DraftRowDto } from './draft-row.dto';

export type PreviewResponse = {
    rows: DraftRowDto[];
    summary: {
        total: number;
        errors: number;
        warnings: number;
    };
    missingMatches: {
        matchId: string;
        date: string;
        opponentName: string;
    }[];
    seasonStartYear: number;
};
```

- [ ] **Step 6: `DeleteBatchDto`**

```ts
// src/api/sales/import/dto/delete-batch.dto.ts
import { IsUUID } from 'class-validator';

export class DeleteBatchDto {
    @IsUUID('4')
    batchId!: string;
}
```

- [ ] **Step 7: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/api/sales/import/dto/
git commit -m "feat(sales-import): add request/response DTOs"
```

---

## Task 6: CSV parser (pure function)

**Files:**
- Create: `src/api/sales/import/sales-import.csv.ts`
- Create: `src/api/sales/import/sales-import.csv.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/api/sales/import/sales-import.csv.spec.ts`:

```ts
import { parseImportCsv } from './sales-import.csv';

describe('parseImportCsv', () => {
    it('parses a minimal valid CSV', () => {
        const csv = 'date,opponent,listedPrice,nbTickets,status,invest\n2025-09-14,Marseille,120,1,SOLD,80\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('ok');

        if (result.kind === 'ok') {
            expect(result.rows).toEqual([
                {
                    rowIndex: 0,
                    date: '2025-09-14',
                    opponent: 'Marseille',
                    listedPrice: 120,
                    nbTickets: 1,
                    status: 'SOLD',
                    invest: 80,
                },
            ]);
        }
    });

    it('defaults invest to 0 when column omitted', () => {
        const csv = 'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('ok');

        if (result.kind === 'ok') {
            expect(result.rows[0].invest).toBe(0);
        }
    });

    it('strips a BOM prefix', () => {
        const csv = '﻿date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('ok');
    });

    it('skips blank rows', () => {
        const csv = 'date,opponent,listedPrice,nbTickets,status\n\n2025-09-14,Marseille,120,1,SOLD\n\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('ok');

        if (result.kind === 'ok') {
            expect(result.rows).toHaveLength(1);
        }
    });

    it('accepts case-insensitive status', () => {
        const csv = 'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,sold\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('ok');

        if (result.kind === 'ok') {
            expect(result.rows[0].status).toBe('SOLD');
        }
    });

    it('reports a missing required column', () => {
        const csv = 'date,opponent,listedPrice,status\n2025-09-14,Marseille,120,SOLD\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('error');

        if (result.kind === 'error') {
            expect(result.error).toBe('missing-column');
            expect(result.column).toBe('nbTickets');
        }
    });

    it('reports an unknown column', () => {
        const csv = 'date,opponent,listedPrice,nbTickets,status,foo\n2025-09-14,Marseille,120,1,SOLD,x\n';
        const result = parseImportCsv(Buffer.from(csv));

        expect(result.kind).toBe('error');

        if (result.kind === 'error') {
            expect(result.error).toBe('unknown-column');
            expect(result.column).toBe('foo');
        }
    });

    it('reports an empty file', () => {
        const result = parseImportCsv(Buffer.from(''));

        expect(result.kind).toBe('error');

        if (result.kind === 'error') {
            expect(result.error).toBe('empty');
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx jest src/api/sales/import/sales-import.csv.spec.ts
```

Expected: FAIL with "Cannot find module './sales-import.csv'".

- [ ] **Step 3: Implement the parser**

Create `src/api/sales/import/sales-import.csv.ts`:

```ts
import Papa from 'papaparse';

export type RawImportRow = {
    rowIndex: number;
    date: string;
    opponent: string;
    listedPrice: number;
    nbTickets: number;
    status: 'PENDING' | 'SOLD' | 'CANCELLED';
    invest: number;
};

export type CsvParseResult =
    | { kind: 'ok'; rows: RawImportRow[] }
    | { kind: 'error'; error: 'missing-column'; column: string }
    | { kind: 'error'; error: 'unknown-column'; column: string }
    | { kind: 'error'; error: 'empty' };

const REQUIRED_COLUMNS = ['date', 'opponent', 'listedPrice', 'nbTickets', 'status'] as const;
const OPTIONAL_COLUMNS = ['invest'] as const;
const ALL_KNOWN_COLUMNS = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

export function parseImportCsv(buffer: Buffer): CsvParseResult {
    const text = buffer.toString('utf8').replace(/^﻿/, '');

    if (text.trim().length === 0) {
        return { kind: 'error', error: 'empty' };
    }

    const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.trim(),
    });

    const headers = parsed.meta.fields ?? [];

    for (const required of REQUIRED_COLUMNS) {
        if (!headers.includes(required)) {
            return { kind: 'error', error: 'missing-column', column: required };
        }
    }

    for (const header of headers) {
        if (!ALL_KNOWN_COLUMNS.has(header)) {
            return { kind: 'error', error: 'unknown-column', column: header };
        }
    }

    const rows: RawImportRow[] = [];

    for (let index = 0; index < parsed.data.length; index++) {
        const raw = parsed.data[index];
        const nonEmpty = Object.values(raw).some((value) => (value ?? '').trim().length > 0);

        if (!nonEmpty) {
            continue;
        }

        rows.push({
            rowIndex: index,
            date: (raw.date ?? '').trim(),
            opponent: (raw.opponent ?? '').trim(),
            listedPrice: Number((raw.listedPrice ?? '').trim()),
            nbTickets: Number((raw.nbTickets ?? '').trim()),
            status: ((raw.status ?? '').trim().toUpperCase() as RawImportRow['status']),
            invest: raw.invest != null && raw.invest.trim().length > 0
                ? Number(raw.invest.trim())
                : 0,
        });
    }

    return { kind: 'ok', rows };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx jest src/api/sales/import/sales-import.csv.spec.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/sales/import/sales-import.csv.ts src/api/sales/import/sales-import.csv.spec.ts
git commit -m "feat(sales-import): CSV parser with header validation"
```

---

## Task 7: Row resolver (match + allocation + coverage) — pure functions

**Files:**
- Create: `src/api/sales/import/sales-import.resolver.ts`
- Create: `src/api/sales/import/sales-import.resolver.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/api/sales/import/sales-import.resolver.spec.ts`:

```ts
import {
    resolveMatchForRow,
    computeDefaultAllocation,
    computeCoverage,
    validateCellShape,
} from './sales-import.resolver';
import type { RawImportRow } from './sales-import.csv';

type Match = { id: string; date: Date; Opponent: { id: string; name: string } };

const rowBase: RawImportRow = {
    rowIndex: 0,
    date: '2025-09-14',
    opponent: 'Marseille',
    listedPrice: 120,
    nbTickets: 1,
    status: 'SOLD',
    invest: 0,
};

function match(id: string, dateIso: string, opponent: string): Match {
    return { id, date: new Date(`${dateIso}T00:00:00Z`), Opponent: { id: `opp-${opponent}`, name: opponent } };
}

describe('validateCellShape', () => {
    it('flags invalid date format', () => {
        const result = validateCellShape({ ...rowBase, date: 'nope' });
        expect(result).toEqual({ status: 'error:invalid-cell', reason: 'date' });
    });

    it('flags nbTickets < 1', () => {
        const result = validateCellShape({ ...rowBase, nbTickets: 0 });
        expect(result).toEqual({ status: 'error:invalid-cell', reason: 'nbTickets' });
    });

    it('flags NaN listedPrice', () => {
        const result = validateCellShape({ ...rowBase, listedPrice: Number.NaN });
        expect(result).toEqual({ status: 'error:invalid-cell', reason: 'listedPrice' });
    });

    it('passes a clean row', () => {
        const result = validateCellShape(rowBase);
        expect(result).toBeNull();
    });
});

describe('resolveMatchForRow', () => {
    it('marks ok when single match matches opponent', () => {
        const matches = [match('m1', '2025-09-14', 'Marseille')];
        const result = resolveMatchForRow(rowBase, matches);
        expect(result).toEqual({ status: 'ok', matchId: 'm1' });
    });

    it('warns opponent-mismatch when single match but wrong opponent', () => {
        const matches = [match('m1', '2025-09-14', 'Lyon')];
        const result = resolveMatchForRow(rowBase, matches);
        expect(result).toEqual({ status: 'warn:opponent-mismatch', matchId: 'm1' });
    });

    it('errors match-missing when no match on date', () => {
        const result = resolveMatchForRow(rowBase, []);
        expect(result).toEqual({ status: 'error:match-missing', matchId: null });
    });

    it('disambiguates by opponent when multiple matches on same date', () => {
        const matches = [
            match('m1', '2025-09-14', 'Lyon'),
            match('m2', '2025-09-14', 'Marseille'),
        ];
        const result = resolveMatchForRow(rowBase, matches);
        expect(result).toEqual({ status: 'ok', matchId: 'm2' });
    });

    it('errors opponent-not-found when multiple matches but no opponent match', () => {
        const matches = [
            match('m1', '2025-09-14', 'Lyon'),
            match('m2', '2025-09-14', 'Monaco'),
        ];
        const result = resolveMatchForRow(rowBase, matches);
        expect(result).toEqual({ status: 'error:opponent-not-found', matchId: null });
    });
});

describe('computeDefaultAllocation', () => {
    it('assigns the single ticket to the first pass when nbTickets = 1', () => {
        const result = computeDefaultAllocation(1, ['p1', 'p2']);
        expect(result).toEqual({
            status: 'ok',
            allocations: [{ seasonPassId: 'p1', nbTickets: 1 }],
        });
    });

    it('warns when multi-ticket with single pass', () => {
        const result = computeDefaultAllocation(3, ['p1']);
        expect(result).toEqual({
            status: 'warn:multi-ticket-single-pass',
            allocations: [{ seasonPassId: 'p1', nbTickets: 3 }],
        });
    });

    it('errors unallocated when multi-ticket with multiple passes', () => {
        const result = computeDefaultAllocation(3, ['p1', 'p2']);
        expect(result).toEqual({
            status: 'error:unallocated',
            allocations: [],
        });
    });
});

describe('computeCoverage', () => {
    it('lists home matches without a resolved sale row', () => {
        const matches = [
            match('m1', '2025-09-14', 'Marseille'),
            match('m2', '2025-09-21', 'Lyon'),
            match('m3', '2025-09-28', 'Monaco'),
        ];
        const resolvedMatchIds = new Set(['m1']);
        const result = computeCoverage(matches, resolvedMatchIds);
        expect(result).toEqual([
            { matchId: 'm2', date: '2025-09-21', opponentName: 'Lyon' },
            { matchId: 'm3', date: '2025-09-28', opponentName: 'Monaco' },
        ]);
    });

    it('returns empty when every match is covered', () => {
        const matches = [match('m1', '2025-09-14', 'Marseille')];
        const result = computeCoverage(matches, new Set(['m1']));
        expect(result).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx jest src/api/sales/import/sales-import.resolver.spec.ts
```

Expected: FAIL with "Cannot find module './sales-import.resolver'".

- [ ] **Step 3: Implement the resolver**

Create `src/api/sales/import/sales-import.resolver.ts`:

```ts
import type { RawImportRow } from './sales-import.csv';
import type { DraftRowStatus } from './dto/draft-row.dto';

type MatchLike = {
    id: string;
    date: Date;
    Opponent: { id: string; name: string };
};

export function validateCellShape(
    row: RawImportRow,
): { status: 'error:invalid-cell'; reason: string } | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
        return { status: 'error:invalid-cell', reason: 'date' };
    }

    if (!Number.isInteger(row.listedPrice) || row.listedPrice < 0) {
        return { status: 'error:invalid-cell', reason: 'listedPrice' };
    }

    if (!Number.isInteger(row.nbTickets) || row.nbTickets < 1) {
        return { status: 'error:invalid-cell', reason: 'nbTickets' };
    }

    if (!Number.isInteger(row.invest) || row.invest < 0) {
        return { status: 'error:invalid-cell', reason: 'invest' };
    }

    if (!['PENDING', 'SOLD', 'CANCELLED'].includes(row.status)) {
        return { status: 'error:invalid-cell', reason: 'status' };
    }

    return null;
}

function toIsoDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function resolveMatchForRow(
    row: RawImportRow,
    seasonMatches: MatchLike[],
): { status: DraftRowStatus; matchId: string | null } {
    const sameDate = seasonMatches.filter((match) => toIsoDateOnly(match.date) === row.date);

    if (sameDate.length === 0) {
        return { status: 'error:match-missing', matchId: null };
    }

    const opponentLower = row.opponent.trim().toLowerCase();

    if (sameDate.length === 1) {
        const match = sameDate[0];
        const opponentMatches = match.Opponent.name.trim().toLowerCase() === opponentLower;

        return {
            status: opponentMatches ? 'ok' : 'warn:opponent-mismatch',
            matchId: match.id,
        };
    }

    const opponentMatch = sameDate.find(
        (match) => match.Opponent.name.trim().toLowerCase() === opponentLower,
    );

    if (opponentMatch == null) {
        return { status: 'error:opponent-not-found', matchId: null };
    }

    return { status: 'ok', matchId: opponentMatch.id };
}

export function computeDefaultAllocation(
    nbTickets: number,
    selectedPassIds: string[],
): {
    status: DraftRowStatus;
    allocations: { seasonPassId: string; nbTickets: number }[];
} {
    if (nbTickets === 1) {
        return {
            status: 'ok',
            allocations: [{ seasonPassId: selectedPassIds[0], nbTickets: 1 }],
        };
    }

    if (selectedPassIds.length === 1) {
        return {
            status: 'warn:multi-ticket-single-pass',
            allocations: [{ seasonPassId: selectedPassIds[0], nbTickets }],
        };
    }

    return { status: 'error:unallocated', allocations: [] };
}

export function computeCoverage(
    seasonHomeMatches: MatchLike[],
    resolvedMatchIds: Set<string>,
): { matchId: string; date: string; opponentName: string }[] {
    const missing: { matchId: string; date: string; opponentName: string }[] = [];

    for (const match of seasonHomeMatches) {
        if (resolvedMatchIds.has(match.id)) {
            continue;
        }

        missing.push({
            matchId: match.id,
            date: toIsoDateOnly(match.date),
            opponentName: match.Opponent.name,
        });
    }

    return missing;
}

export function pickWorstStatus(statuses: DraftRowStatus[]): DraftRowStatus {
    const priority: DraftRowStatus[] = [
        'error:invalid-cell',
        'error:match-missing',
        'error:opponent-not-found',
        'error:unallocated',
        'warn:opponent-mismatch',
        'warn:multi-ticket-single-pass',
        'ok',
    ];

    for (const status of priority) {
        if (statuses.includes(status)) {
            return status;
        }
    }

    return 'ok';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx jest src/api/sales/import/sales-import.resolver.spec.ts
```

Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/sales/import/sales-import.resolver.ts src/api/sales/import/sales-import.resolver.spec.ts
git commit -m "feat(sales-import): match resolver + allocation defaults + coverage"
```

---

## Task 8: `SalesImportService` (orchestration)

**Files:**
- Create: `src/api/sales/import/sales-import.service.ts`
- Create: `src/api/sales/import/sales-import.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/api/sales/import/sales-import.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { SalesImportService } from './sales-import.service';
import { IMatchesDbService } from '../../../db/matches/matches.db.interface';
import { ISeasonPassesDbService } from '../../../db/season-passes/season-passes.db.interface';
import { ISalesImportDbService } from '../../../db/sales-import/sales-import.db.interface';
import { RedisService } from '../../../redis/redis.service';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { PSG_COMMISSION } from '../../../shared/constants';
import type { UserId } from '@psg/shared/ids';

describe('SalesImportService', () => {
    let service: SalesImportService;
    let matchesDb: DeepMockProxy<IMatchesDbService>;
    let passesDb: DeepMockProxy<ISeasonPassesDbService>;
    let importDb: DeepMockProxy<ISalesImportDbService>;
    let redis: DeepMockProxy<RedisService>;

    const userId = 'user-1' as UserId;
    const pass1 = { id: 'p1', userId, seasonStartYear: 2025, price: 1000, label: 'A', category: 'x', row: '1', seat: '1' } as any;
    const pass2 = { id: 'p2', userId, seasonStartYear: 2025, price: 1000, label: 'B', category: 'x', row: '1', seat: '2' } as any;
    const passOtherSeason = { ...pass1, id: 'p3', seasonStartYear: 2024 };

    const homeMatch = {
        id: 'm1',
        date: new Date('2025-09-14T20:00:00Z'),
        atHome: true,
        Opponent: { id: 'opp1', name: 'Marseille' },
    } as any;

    beforeEach(async () => {
        matchesDb = mockDeep<IMatchesDbService>();
        passesDb = mockDeep<ISeasonPassesDbService>();
        importDb = mockDeep<ISalesImportDbService>();
        redis = mockDeep<RedisService>();

        const moduleRef = await Test.createTestingModule({
            providers: [
                SalesImportService,
                { provide: IMatchesDbService, useValue: matchesDb },
                { provide: ISeasonPassesDbService, useValue: passesDb },
                { provide: ISalesImportDbService, useValue: importDb },
                { provide: RedisService, useValue: redis },
            ],
        }).compile();

        service = moduleRef.get(SalesImportService);
    });

    function csvBuffer(body: string): Buffer {
        return Buffer.from(`date,opponent,listedPrice,nbTickets,status,invest\n${body}\n`);
    }

    describe('preview', () => {
        it('rejects when selected passes span multiple seasons', async () => {
            passesDb.findById.mockImplementation(async (id) =>
                id === 'p1' ? pass1 : passOtherSeason,
            );

            await expect(
                service.preview(userId, csvBuffer('2025-09-14,Marseille,120,1,SOLD,0'), ['p1', 'p3']),
            ).rejects.toBeInstanceOf(DomainException);
        });

        it('rejects when a selected pass does not belong to the user', async () => {
            passesDb.findById.mockResolvedValue({ ...pass1, userId: 'someone-else' as UserId });

            await expect(
                service.preview(userId, csvBuffer('2025-09-14,Marseille,120,1,SOLD,0'), ['p1']),
            ).rejects.toBeInstanceOf(DomainException);
        });

        it('produces an annotated draft with resolved match and coverage', async () => {
            passesDb.findById.mockResolvedValue(pass1);
            matchesDb.getHomeMatchesForSeason.mockResolvedValue([homeMatch, {
                ...homeMatch, id: 'm2', date: new Date('2025-09-21T20:00:00Z'),
                Opponent: { id: 'opp2', name: 'Lyon' },
            }]);

            const result = await service.preview(
                userId,
                csvBuffer('2025-09-14,Marseille,120,1,SOLD,0'),
                ['p1'],
            );

            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].rowStatus).toBe('ok');
            expect(result.rows[0].matchId).toBe('m1');
            expect(result.rows[0].allocations).toEqual([{ seasonPassId: 'p1', nbTickets: 1 }]);
            expect(result.summary).toEqual({ total: 1, errors: 0, warnings: 0 });
            expect(result.missingMatches).toEqual([
                { matchId: 'm2', date: '2025-09-21', opponentName: 'Lyon' },
            ]);
            expect(result.seasonStartYear).toBe(2025);
        });

        it('surfaces a header error as a domain exception', async () => {
            passesDb.findById.mockResolvedValue(pass1);

            await expect(
                service.preview(
                    userId,
                    Buffer.from('date,opponent,listedPrice,status\n2025-09-14,Marseille,120,SOLD\n'),
                    ['p1'],
                ),
            ).rejects.toBeInstanceOf(DomainException);
        });
    });

    describe('commit', () => {
        it('rejects when a row still has an error after client edits', async () => {
            passesDb.findById.mockResolvedValue(pass1);
            matchesDb.getHomeMatchesForSeason.mockResolvedValue([]);

            await expect(
                service.commit(userId, {
                    selectedPassIds: ['p1'],
                    rows: [
                        {
                            rowIndex: 0,
                            date: '2025-09-14',
                            opponent: 'Marseille',
                            listedPrice: 120,
                            nbTickets: 1,
                            status: 'SOLD',
                            invest: 0,
                            allocations: [{ seasonPassId: 'p1', nbTickets: 1 }],
                            rowStatus: 'ok',
                        },
                    ],
                }),
            ).rejects.toBeInstanceOf(DomainException);
        });

        it('bulk-creates sales with a batch id and invalidates caches', async () => {
            passesDb.findById.mockResolvedValue(pass1);
            matchesDb.getHomeMatchesForSeason.mockResolvedValue([homeMatch]);
            importDb.bulkCreate.mockResolvedValue(1);

            const result = await service.commit(userId, {
                selectedPassIds: ['p1'],
                rows: [
                    {
                        rowIndex: 0,
                        date: '2025-09-14',
                        opponent: 'Marseille',
                        listedPrice: 120,
                        nbTickets: 1,
                        status: 'SOLD',
                        invest: 0,
                        matchId: 'm1',
                        allocations: [{ seasonPassId: 'p1', nbTickets: 1 }],
                        rowStatus: 'ok',
                    },
                ],
            });

            expect(result.salesCreated).toBe(1);
            expect(result.batchId).toMatch(/^[0-9a-f-]{36}$/);
            expect(importDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId,
                    batchId: result.batchId,
                    sales: [
                        expect.objectContaining({
                            matchId: 'm1',
                            listedPrice: 120,
                            invest: 0,
                            nbTickets: 1,
                            status: SaleStatus.SOLD,
                            profit: (120 * (100 - PSG_COMMISSION)) / 100,
                            allocations: [{ seasonPassId: 'p1', nbTickets: 1 }],
                        }),
                    ],
                }),
            );
            expect(redis.invalidatePattern).toHaveBeenCalled();
        });
    });

    describe('revert', () => {
        it('returns 0 when nothing to delete (idempotent)', async () => {
            importDb.deleteBatch.mockResolvedValue(0);
            const result = await service.revert(userId, 'batch-missing');
            expect(result.deleted).toBe(0);
        });

        it('invalidates caches after a successful delete', async () => {
            importDb.deleteBatch.mockResolvedValue(3);
            const result = await service.revert(userId, 'batch-1');
            expect(result.deleted).toBe(3);
            expect(redis.invalidatePattern).toHaveBeenCalled();
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx jest src/api/sales/import/sales-import.service.spec.ts
```

Expected: FAIL with "Cannot find module './sales-import.service'".

- [ ] **Step 3: Implement the service**

Create `src/api/sales/import/sales-import.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import type { TicketCount } from '@psg/shared/counts';
import type { SeasonYear } from '@psg/shared/time';

import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { IMatchesDbService } from '../../../db/matches/matches.db.interface';
import { ISeasonPassesDbService } from '../../../db/season-passes/season-passes.db.interface';
import { ISalesImportDbService } from '../../../db/sales-import/sales-import.db.interface';
import CACHE_KEYS from '../../../redis/CACHE_KEYS';
import { RedisService } from '../../../redis/redis.service';
import { PSG_COMMISSION } from '../../../shared/constants';

import { parseImportCsv, RawImportRow } from './sales-import.csv';
import {
    computeCoverage,
    computeDefaultAllocation,
    pickWorstStatus,
    resolveMatchForRow,
    validateCellShape,
} from './sales-import.resolver';
import { CommitRequestDto } from './dto/commit-request.dto';
import { DraftRowDto, DraftRowStatus } from './dto/draft-row.dto';
import { PreviewResponse } from './dto/preview-response.dto';

@Injectable()
export class SalesImportService {
    constructor(
        private readonly matchesDb: IMatchesDbService,
        private readonly passesDb: ISeasonPassesDbService,
        private readonly importDb: ISalesImportDbService,
        private readonly redis: RedisService,
    ) {}

    async preview(
        userId: UserId,
        file: Buffer,
        selectedPassIds: string[],
    ): Promise<PreviewResponse> {
        const seasonStartYear = await this.resolveSeason(userId, selectedPassIds);
        const parsed = parseImportCsv(file);

        if (parsed.kind === 'error') {
            throw new DomainException(ErrorCode.SALE_IMPORT_CSV_INVALID);
        }

        const seasonMatches = await this.matchesDb.getHomeMatchesForSeason(
            seasonStartYear as SeasonYear,
        );

        const rows = parsed.rows.map((raw) =>
            this.buildDraftRow(raw, seasonMatches, selectedPassIds),
        );

        const resolvedIds = new Set<string>();

        for (const row of rows) {
            if (row.matchId != null) {
                resolvedIds.add(row.matchId);
            }
        }

        const missingMatches = computeCoverage(seasonMatches, resolvedIds);

        return {
            rows,
            summary: this.summarize(rows),
            missingMatches,
            seasonStartYear,
        };
    }

    async commit(
        userId: UserId,
        payload: CommitRequestDto,
    ): Promise<{ batchId: string; salesCreated: number }> {
        const seasonStartYear = await this.resolveSeason(userId, payload.selectedPassIds);
        const seasonMatches = await this.matchesDb.getHomeMatchesForSeason(
            seasonStartYear as SeasonYear,
        );

        const revalidated = payload.rows.map((row) =>
            this.buildDraftRow(this.rowToRaw(row), seasonMatches, payload.selectedPassIds, row.allocations),
        );

        const hasError = revalidated.some((row) => row.rowStatus.startsWith('error:'));

        if (hasError) {
            throw new DomainException(ErrorCode.SALE_IMPORT_ROWS_INVALID);
        }

        const batchId = randomUUID();

        const salesCreated = await this.importDb.bulkCreate({
            userId,
            batchId,
            sales: revalidated.map((row) => ({
                matchId: row.matchId as MatchId,
                listedPrice: row.listedPrice as ListedPrice,
                invest: row.invest as Invest,
                profit: this.computeProfit(row.listedPrice) as Profit,
                nbTickets: row.nbTickets as TicketCount,
                status: row.status as SaleStatus,
                allocations: row.allocations.map((allocation) => ({
                    seasonPassId: allocation.seasonPassId as SeasonPassId,
                    nbTickets: allocation.nbTickets as TicketCount,
                })),
            })),
        });

        await this.redis.invalidatePattern(CACHE_KEYS.invalidateSales(userId));
        await this.redis.invalidatePattern(CACHE_KEYS.invalidateAccounting(userId));

        return { batchId, salesCreated };
    }

    async revert(userId: UserId, batchId: string): Promise<{ deleted: number }> {
        const deleted = await this.importDb.deleteBatch(userId, batchId);

        if (deleted > 0) {
            await this.redis.invalidatePattern(CACHE_KEYS.invalidateSales(userId));
            await this.redis.invalidatePattern(CACHE_KEYS.invalidateAccounting(userId));
        }

        return { deleted };
    }

    private async resolveSeason(userId: UserId, selectedPassIds: string[]): Promise<number> {
        const years = new Set<number>();

        for (const passId of selectedPassIds) {
            const pass = await this.passesDb.findById(passId as SeasonPassId);

            if (pass == null || pass.userId !== userId) {
                throw new DomainException(ErrorCode.SALE_IMPORT_PASS_INVALID);
            }

            years.add(pass.seasonStartYear);
        }

        if (years.size !== 1) {
            throw new DomainException(ErrorCode.SALE_IMPORT_PASS_INVALID);
        }

        return [...years][0];
    }

    private buildDraftRow(
        raw: RawImportRow,
        seasonMatches: Parameters<typeof resolveMatchForRow>[1],
        selectedPassIds: string[],
        clientAllocations?: DraftRowDto['allocations'],
    ): DraftRowDto {
        const cellError = validateCellShape(raw);

        if (cellError != null) {
            return {
                rowIndex: raw.rowIndex,
                date: raw.date,
                opponent: raw.opponent,
                listedPrice: raw.listedPrice,
                nbTickets: raw.nbTickets,
                invest: raw.invest,
                status: raw.status,
                matchId: undefined,
                allocations: [],
                rowStatus: 'error:invalid-cell',
            };
        }

        const matchResult = resolveMatchForRow(raw, seasonMatches);
        const allocations = clientAllocations ?? [];
        const allocationResult =
            clientAllocations != null && clientAllocations.length > 0
                ? this.validateClientAllocations(raw.nbTickets, clientAllocations, selectedPassIds)
                : computeDefaultAllocation(raw.nbTickets, selectedPassIds);

        const finalStatus = pickWorstStatus([matchResult.status, allocationResult.status]);

        return {
            rowIndex: raw.rowIndex,
            date: raw.date,
            opponent: raw.opponent,
            listedPrice: raw.listedPrice,
            nbTickets: raw.nbTickets,
            invest: raw.invest,
            status: raw.status,
            matchId: matchResult.matchId ?? undefined,
            allocations: allocationResult.allocations.length > 0
                ? allocationResult.allocations
                : allocations,
            rowStatus: finalStatus,
        };
    }

    private validateClientAllocations(
        nbTickets: number,
        allocations: DraftRowDto['allocations'],
        selectedPassIds: string[],
    ): { status: DraftRowStatus; allocations: DraftRowDto['allocations'] } {
        const total = allocations.reduce((sum, allocation) => sum + allocation.nbTickets, 0);
        const allBelongToSelection = allocations.every((allocation) =>
            selectedPassIds.includes(allocation.seasonPassId),
        );

        if (total !== nbTickets || !allBelongToSelection) {
            return { status: 'error:unallocated', allocations: [] };
        }

        return { status: 'ok', allocations };
    }

    private rowToRaw(row: DraftRowDto): RawImportRow {
        return {
            rowIndex: row.rowIndex,
            date: row.date,
            opponent: row.opponent,
            listedPrice: row.listedPrice,
            nbTickets: row.nbTickets,
            status: row.status,
            invest: row.invest,
        };
    }

    private summarize(rows: DraftRowDto[]): { total: number; errors: number; warnings: number } {
        let errors = 0;
        let warnings = 0;

        for (const row of rows) {
            if (row.rowStatus.startsWith('error:')) {
                errors += 1;
            } else if (row.rowStatus.startsWith('warn:')) {
                warnings += 1;
            }
        }

        return { total: rows.length, errors, warnings };
    }

    private computeProfit(listedPrice: number): number {
        return (listedPrice * (100 - PSG_COMMISSION)) / 100;
    }
}
```

- [ ] **Step 4: Add new `ErrorCode` entries**

Open `src/common/exceptions/error-codes.enum.ts` and add three entries (leave existing ones untouched):

```ts
export enum ErrorCode {
    // ... existing entries ...
    SALE_IMPORT_CSV_INVALID = 'SALE_IMPORT_CSV_INVALID',
    SALE_IMPORT_ROWS_INVALID = 'SALE_IMPORT_ROWS_INVALID',
    SALE_IMPORT_PASS_INVALID = 'SALE_IMPORT_PASS_INVALID',
}
```

If the http-exception mapper (`src/common/exceptions/http-exception.mapper.ts`) has an explicit switch on `ErrorCode`, add the three codes there with status 400. If it maps unknowns to 400 by default, no change is needed — read the file first to decide.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npx jest src/api/sales/import/sales-import.service.spec.ts
```

Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/sales/import/sales-import.service.ts src/api/sales/import/sales-import.service.spec.ts src/common/exceptions/error-codes.enum.ts src/common/exceptions/http-exception.mapper.ts
git commit -m "feat(sales-import): orchestration service for preview/commit/revert"
```

---

## Task 9: Controller + module wiring

**Files:**
- Create: `src/api/sales/import/sales-import.controller.ts`
- Create: `src/api/sales/import/sales-import.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Write the controller**

Create `src/api/sales/import/sales-import.controller.ts`:

```ts
import {
    Body,
    Controller,
    Delete,
    Param,
    Post,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { toHttpException } from '../../../common/exceptions/http-exception.mapper';
import { User } from '../../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../../shared/types/authenticated-user.type';
import { CommitRequestDto } from './dto/commit-request.dto';
import { DeleteBatchDto } from './dto/delete-batch.dto';
import { PreviewRequestDto } from './dto/preview-request.dto';
import { PreviewResponse } from './dto/preview-response.dto';
import { SalesImportService } from './sales-import.service';

const ONE_MEGABYTE = 1024 * 1024;

@Controller('sales/import')
export class SalesImportController {
    constructor(private readonly service: SalesImportService) {}

    @Post('/preview')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * ONE_MEGABYTE } }))
    async preview(
        @User() user: AuthenticatedUser,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: PreviewRequestDto,
    ): Promise<PreviewResponse> {
        try {
            return await this.service.preview(user.id, file.buffer, body.selectedPassIds);
        } catch (error) {
            throw toHttpException(error);
        }
    }

    @Post('/commit')
    async commit(
        @User() user: AuthenticatedUser,
        @Body() body: CommitRequestDto,
    ): Promise<{ batchId: string; salesCreated: number }> {
        try {
            return await this.service.commit(user.id, body);
        } catch (error) {
            throw toHttpException(error);
        }
    }

    @Delete('/:batchId')
    async revert(
        @User() user: AuthenticatedUser,
        @Param() { batchId }: DeleteBatchDto,
    ): Promise<{ deleted: number }> {
        try {
            return await this.service.revert(user.id, batchId);
        } catch (error) {
            throw toHttpException(error);
        }
    }
}
```

Note: on `PreviewRequestDto` in a `multipart/form-data` request, `selectedPassIds` comes across as a repeated form field or a JSON string. The client-side task (Task 12) sends it as a JSON string; validate that shape here by extending `PreviewRequestDto` with `@Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))` from `class-transformer` on the field. Do this at DTO-creation time if you skipped it earlier; otherwise add now:

```ts
// src/api/sales/import/dto/preview-request.dto.ts (final form)
import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class PreviewRequestDto {
    @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('4', { each: true })
    selectedPassIds!: string[];
}
```

- [ ] **Step 2: Write the module**

Create `src/api/sales/import/sales-import.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DbModule } from '../../../db/db.module';
import { RedisModule } from '../../../redis/redis.module';
import { SalesImportController } from './sales-import.controller';
import { SalesImportService } from './sales-import.service';

@Module({
    imports: [DbModule, RedisModule],
    controllers: [SalesImportController],
    providers: [SalesImportService],
})
export class SalesImportModule {}
```

If `RedisModule` is not the actual module name in this project, use whichever module already provides `RedisService` (check what `SalesModule` imports; `DbModule` may already re-export it).

- [ ] **Step 3: Register in `AppModule`**

In `src/app.module.ts`, add:

```ts
import { SalesImportModule } from './api/sales/import/sales-import.module';

@Module({
    imports: [
        // ... existing modules ...
        SalesImportModule,
    ],
})
export class AppModule {}
```

- [ ] **Step 4: Typecheck + lint + full test run**

Run:

```bash
npm run typecheck && npm run lint && npx jest src/api/sales/import
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/sales/import/sales-import.controller.ts src/api/sales/import/sales-import.module.ts src/api/sales/import/dto/preview-request.dto.ts src/app.module.ts
git commit -m "feat(sales-import): wire controller and module"
```

---

## Task 10: Frontend — types + API client

**Files:**
- Create: `web/src/lib/types-import.ts`
- Create: `web/src/lib/import-api.ts`

- [ ] **Step 1: Write shared types**

Create `web/src/lib/types-import.ts`:

```ts
export type DraftRowStatus =
    | 'ok'
    | 'warn:opponent-mismatch'
    | 'warn:multi-ticket-single-pass'
    | 'error:match-missing'
    | 'error:opponent-not-found'
    | 'error:unallocated'
    | 'error:invalid-cell';

export type DraftAllocation = {
    seasonPassId: string;
    nbTickets: number;
};

export type DraftRow = {
    rowIndex: number;
    date: string;
    opponent: string;
    listedPrice: number;
    nbTickets: number;
    invest: number;
    status: 'PENDING' | 'SOLD' | 'CANCELLED';
    matchId?: string;
    allocations: DraftAllocation[];
    rowStatus: DraftRowStatus;
};

export type PreviewResponse = {
    rows: DraftRow[];
    summary: { total: number; errors: number; warnings: number };
    missingMatches: { matchId: string; date: string; opponentName: string }[];
    seasonStartYear: number;
};
```

- [ ] **Step 2: Write the API client**

Create `web/src/lib/import-api.ts`:

```ts
import type { DraftRow, PreviewResponse } from './types-import';

async function handle<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text.length > 0 ? text : `Request failed (${response.status})`);
    }

    return response.json() as Promise<T>;
}

export async function previewImport(
    file: File,
    selectedPassIds: string[],
): Promise<PreviewResponse> {
    const body = new FormData();
    body.append('file', file);
    body.append('selectedPassIds', JSON.stringify(selectedPassIds));

    const response = await fetch('/api/sales/import/preview', {
        method: 'POST',
        body,
        credentials: 'include',
    });

    return handle<PreviewResponse>(response);
}

export async function commitImport(
    selectedPassIds: string[],
    rows: DraftRow[],
): Promise<{ batchId: string; salesCreated: number }> {
    const response = await fetch('/api/sales/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedPassIds, rows }),
        credentials: 'include',
    });

    return handle<{ batchId: string; salesCreated: number }>(response);
}

export async function revertImport(batchId: string): Promise<{ deleted: number }> {
    const response = await fetch(`/api/sales/import/${batchId}`, {
        method: 'DELETE',
        credentials: 'include',
    });

    return handle<{ deleted: number }>(response);
}
```

If the project already routes browser calls through a SvelteKit `/api/*` proxy (see how `web/src/lib/api.ts` works), keep the paths as `/api/sales/import/...`. If the frontend calls the backend directly, replace `/api/sales/import/...` with `${PUBLIC_BACKEND_URL}/sales/import/...` and add the `Authorization: Bearer` header the same way existing pages do it.

- [ ] **Step 3: Typecheck**

Run:

```bash
cd web && npm run check && cd ..
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/types-import.ts web/src/lib/import-api.ts
git commit -m "feat(web): import types and API client"
```

---

## Task 11: Frontend — modal shell (steps 1 & 2)

**Files:**
- Create: `web/src/lib/ui/ImportModal.svelte`
- Create: `web/src/lib/ui/ImportModalStepPasses.svelte`
- Create: `web/src/lib/ui/ImportModalStepUpload.svelte`

- [ ] **Step 1: Modal shell (step routing + close/back/next controls)**

Create `web/src/lib/ui/ImportModal.svelte`:

```svelte
<script lang="ts">
    import ImportModalStepPasses from './ImportModalStepPasses.svelte';
    import ImportModalStepUpload from './ImportModalStepUpload.svelte';
    import ImportModalStepReview from './ImportModalStepReview.svelte';
    import type { PreviewResponse } from '../types-import';

    let { open = $bindable(false), passes }: {
        open: boolean;
        passes: { id: string; label: string; seasonStartYear: number }[];
    } = $props();

    let step = $state<1 | 2 | 3>(1);
    let selectedPassIds = $state<string[]>([]);
    let preview = $state<PreviewResponse | null>(null);

    function close() {
        open = false;
        step = 1;
        selectedPassIds = [];
        preview = null;
    }

    function onPassesConfirmed(ids: string[]) {
        selectedPassIds = ids;
        step = 2;
    }

    function onPreviewReady(data: PreviewResponse) {
        preview = data;
        step = 3;
    }
</script>

{#if open}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div class="w-full max-w-4xl rounded-lg bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <header class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold">Import sales · step {step} / 3</h2>
                <button type="button" onclick={close} class="text-neutral-400 hover:text-neutral-100">Close</button>
            </header>

            {#if step === 1}
                <ImportModalStepPasses {passes} onConfirmed={onPassesConfirmed} />
            {:else if step === 2}
                <ImportModalStepUpload {selectedPassIds} onPreviewReady={onPreviewReady} onBack={() => (step = 1)} />
            {:else if step === 3 && preview}
                <ImportModalStepReview {selectedPassIds} initialPreview={preview} onDone={close} />
            {/if}
        </div>
    </div>
{/if}
```

- [ ] **Step 2: Step 1 (pass selection)**

Create `web/src/lib/ui/ImportModalStepPasses.svelte`:

```svelte
<script lang="ts">
    let { passes, onConfirmed }: {
        passes: { id: string; label: string; seasonStartYear: number }[];
        onConfirmed: (ids: string[]) => void;
    } = $props();

    let selected = $state<Set<string>>(new Set());

    const selectedIds = $derived([...selected]);
    const inferredYear = $derived(
        selectedIds
            .map((id) => passes.find((pass) => pass.id === id)?.seasonStartYear)
            .filter((year): year is number => year != null),
    );
    const singleSeason = $derived(new Set(inferredYear).size <= 1);

    function toggle(id: string) {
        const next = new Set(selected);

        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }

        selected = next;
    }
</script>

<div class="space-y-4">
    <p class="text-sm text-neutral-300">Pick one or more season passes. All sales in the CSV will be attributed to these passes.</p>

    <ul class="space-y-2">
        {#each passes as pass (pass.id)}
            <li>
                <label class="flex cursor-pointer items-center gap-3 rounded border border-neutral-700 p-3 hover:border-neutral-500">
                    <input type="checkbox" checked={selected.has(pass.id)} onchange={() => toggle(pass.id)} />
                    <span class="font-medium">{pass.label}</span>
                    <span class="text-sm text-neutral-400">Season {pass.seasonStartYear}–{pass.seasonStartYear + 1}</span>
                </label>
            </li>
        {/each}
    </ul>

    {#if !singleSeason}
        <p class="text-sm text-amber-400">Selected passes must all belong to the same season.</p>
    {/if}

    <div class="flex justify-end">
        <button
            type="button"
            class="rounded bg-neutral-100 px-4 py-2 text-neutral-900 disabled:opacity-40"
            disabled={selectedIds.length === 0 || !singleSeason}
            onclick={() => onConfirmed(selectedIds)}
        >
            Next
        </button>
    </div>
</div>
```

Creating a new pass inline is out of scope for this task; users add passes on the existing pass page before opening the import modal. Add a plain-text link at the top of the pass list ("Manage passes →" → `/season`) so the user knows where to go, but do not embed the pass-creation form here.

- [ ] **Step 3: Step 2 (upload)**

Create `web/src/lib/ui/ImportModalStepUpload.svelte`:

```svelte
<script lang="ts">
    import { previewImport } from '../import-api';
    import type { PreviewResponse } from '../types-import';

    let { selectedPassIds, onPreviewReady, onBack }: {
        selectedPassIds: string[];
        onPreviewReady: (data: PreviewResponse) => void;
        onBack: () => void;
    } = $props();

    let file = $state<File | null>(null);
    let error = $state<string | null>(null);
    let loading = $state(false);

    async function submit() {
        if (file == null) {
            return;
        }

        loading = true;
        error = null;

        try {
            const preview = await previewImport(file, selectedPassIds);
            onPreviewReady(preview);
        } catch (caught) {
            error = caught instanceof Error ? caught.message : 'Upload failed';
        } finally {
            loading = false;
        }
    }
</script>

<div class="space-y-4">
    <p class="text-sm text-neutral-300">Upload a CSV with columns <code>date, opponent, listedPrice, nbTickets, status, invest</code>. One file = one season.</p>

    <input
        type="file"
        accept=".csv,text/csv"
        onchange={(event) => {
            const target = event.currentTarget as HTMLInputElement;
            file = target.files?.[0] ?? null;
        }}
        class="block w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-neutral-100"
    />

    {#if error}
        <p class="text-sm text-red-400">{error}</p>
    {/if}

    <div class="flex justify-between">
        <button type="button" onclick={onBack} class="text-sm text-neutral-400 hover:text-neutral-200">Back</button>
        <button
            type="button"
            class="rounded bg-neutral-100 px-4 py-2 text-neutral-900 disabled:opacity-40"
            disabled={file == null || loading}
            onclick={submit}
        >
            {loading ? 'Analyzing…' : 'Preview'}
        </button>
    </div>
</div>
```

- [ ] **Step 4: Typecheck**

Run:

```bash
cd web && npm run check && cd ..
```

Expected: PASS (imports for step 3 will still be missing until Task 12 — if the check fails on `ImportModalStepReview`, add a placeholder `<div />` component temporarily. Prefer to defer the check until Task 12).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/ui/ImportModal.svelte web/src/lib/ui/ImportModalStepPasses.svelte web/src/lib/ui/ImportModalStepUpload.svelte
git commit -m "feat(web): import modal shell with pass selection and upload steps"
```

---

## Task 12: Frontend — draft review (step 3)

**Files:**
- Create: `web/src/lib/ui/ImportModalStepReview.svelte`
- Create: `web/src/lib/ui/ImportDraftTable.svelte`
- Create: `web/src/lib/ui/ImportMissingMatchesPanel.svelte`

- [ ] **Step 1: Draft table (rendering + inline edits)**

Create `web/src/lib/ui/ImportDraftTable.svelte`:

```svelte
<script lang="ts">
    import type { DraftRow } from '../types-import';

    let { rows = $bindable(), onRowChange }: {
        rows: DraftRow[];
        onRowChange: (rowIndex: number, patch: Partial<DraftRow>) => void;
    } = $props();

    function badge(status: string): string {
        if (status === 'ok') return 'bg-emerald-800 text-emerald-100';
        if (status.startsWith('warn:')) return 'bg-amber-800 text-amber-100';
        return 'bg-red-800 text-red-100';
    }
</script>

<table class="w-full text-sm">
    <thead class="text-left text-neutral-400">
        <tr>
            <th class="py-2">Status</th>
            <th>Date</th>
            <th>Opponent</th>
            <th>Listed €</th>
            <th>Tickets</th>
            <th>Invest €</th>
            <th>Status</th>
            <th>Allocation</th>
            <th></th>
        </tr>
    </thead>
    <tbody>
        {#each rows as row (row.rowIndex)}
            <tr class="border-t border-neutral-800">
                <td class="py-2"><span class="rounded px-2 py-1 text-xs {badge(row.rowStatus)}">{row.rowStatus}</span></td>
                <td>
                    <input type="date" value={row.date}
                        onchange={(event) => onRowChange(row.rowIndex, { date: (event.currentTarget as HTMLInputElement).value })}
                        class="rounded border border-neutral-700 bg-neutral-900 p-1"
                    />
                </td>
                <td>
                    <input type="text" value={row.opponent}
                        onchange={(event) => onRowChange(row.rowIndex, { opponent: (event.currentTarget as HTMLInputElement).value })}
                        class="rounded border border-neutral-700 bg-neutral-900 p-1"
                    />
                </td>
                <td>
                    <input type="number" min="0" value={row.listedPrice}
                        onchange={(event) => onRowChange(row.rowIndex, { listedPrice: Number((event.currentTarget as HTMLInputElement).value) })}
                        class="w-20 rounded border border-neutral-700 bg-neutral-900 p-1"
                    />
                </td>
                <td>{row.nbTickets}</td>
                <td>
                    <input type="number" min="0" value={row.invest}
                        onchange={(event) => onRowChange(row.rowIndex, { invest: Number((event.currentTarget as HTMLInputElement).value) })}
                        class="w-20 rounded border border-neutral-700 bg-neutral-900 p-1"
                    />
                </td>
                <td>
                    <select value={row.status}
                        onchange={(event) => onRowChange(row.rowIndex, { status: (event.currentTarget as HTMLSelectElement).value as DraftRow['status'] })}
                        class="rounded border border-neutral-700 bg-neutral-900 p-1"
                    >
                        <option>PENDING</option>
                        <option>SOLD</option>
                        <option>CANCELLED</option>
                    </select>
                </td>
                <td>
                    {#if row.allocations.length === 0}
                        <span class="text-red-400">unassigned</span>
                    {:else}
                        {row.allocations.map((allocation) => `${allocation.seasonPassId.slice(0, 6)}:${allocation.nbTickets}`).join(' · ')}
                    {/if}
                </td>
                <td>
                    <button type="button" class="text-neutral-500 hover:text-red-400"
                        onclick={() => onRowChange(row.rowIndex, { rowStatus: '__delete' as never })}
                    >×</button>
                </td>
            </tr>
        {/each}
    </tbody>
</table>
```

The allocation editor (multi-pass split popover) is deliberately not embedded in this task; multi-ticket rows land as `error:unallocated`. The step 3 wrapper (Step 3 below) surfaces those inline as a compact number-input row when the user clicks on the allocation cell. The `__delete` sentinel is handled by the wrapper.

- [ ] **Step 2: Missing-matches panel**

Create `web/src/lib/ui/ImportMissingMatchesPanel.svelte`:

```svelte
<script lang="ts">
    let { missing, onAdd }: {
        missing: { matchId: string; date: string; opponentName: string }[];
        onAdd: (match: { matchId: string; date: string; opponentName: string }) => void;
    } = $props();
</script>

{#if missing.length > 0}
    <section class="mt-6 rounded border border-neutral-800 p-4">
        <h3 class="mb-2 text-sm font-semibold text-neutral-300">Home matches without a sale in this import</h3>
        <ul class="space-y-1 text-sm">
            {#each missing as match (match.matchId)}
                <li class="flex items-center justify-between">
                    <span>{match.date} · {match.opponentName}</span>
                    <button type="button" class="text-neutral-100 underline" onclick={() => onAdd(match)}>+ add sale</button>
                </li>
            {/each}
        </ul>
    </section>
{/if}
```

- [ ] **Step 3: Wrapper: state + validate + undo + allocation editor**

Create `web/src/lib/ui/ImportModalStepReview.svelte`:

```svelte
<script lang="ts">
    import { commitImport, previewImport, revertImport } from '../import-api';
    import type { DraftRow, PreviewResponse } from '../types-import';
    import ImportDraftTable from './ImportDraftTable.svelte';
    import ImportMissingMatchesPanel from './ImportMissingMatchesPanel.svelte';

    let { selectedPassIds, initialPreview, onDone }: {
        selectedPassIds: string[];
        initialPreview: PreviewResponse;
        onDone: () => void;
    } = $props();

    let rows = $state<DraftRow[]>(initialPreview.rows);
    let missing = $state(initialPreview.missingMatches);
    let summary = $state(initialPreview.summary);
    let seasonStartYear = initialPreview.seasonStartYear;

    let committing = $state(false);
    let lastBatchId = $state<string | null>(null);
    let error = $state<string | null>(null);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function markChanged() {
        if (debounceTimer != null) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(rebuildPreview, 400);
    }

    async function rebuildPreview() {
        const csv = rowsToCsv(rows);
        const file = new File([csv], 'draft.csv', { type: 'text/csv' });

        try {
            const preview = await previewImport(file, selectedPassIds);
            rows = mergeAllocations(preview.rows, rows);
            missing = preview.missingMatches;
            summary = preview.summary;
        } catch (caught) {
            error = caught instanceof Error ? caught.message : 'Re-preview failed';
        }
    }

    function onRowChange(rowIndex: number, patch: Partial<DraftRow>) {
        if ((patch as { rowStatus?: string }).rowStatus === '__delete') {
            rows = rows.filter((row) => row.rowIndex !== rowIndex);
            markChanged();

            return;
        }

        rows = rows.map((row) => (row.rowIndex === rowIndex ? { ...row, ...patch } : row));
        markChanged();
    }

    function addRowForMatch(match: { matchId: string; date: string; opponentName: string }) {
        const nextIndex = rows.length === 0 ? 0 : Math.max(...rows.map((row) => row.rowIndex)) + 1;

        rows = [
            ...rows,
            {
                rowIndex: nextIndex,
                date: match.date,
                opponent: match.opponentName,
                listedPrice: 0,
                nbTickets: 1,
                invest: 0,
                status: 'PENDING',
                matchId: match.matchId,
                allocations: [{ seasonPassId: selectedPassIds[0], nbTickets: 1 }],
                rowStatus: 'ok',
            },
        ];

        markChanged();
    }

    async function validate() {
        committing = true;
        error = null;

        try {
            const result = await commitImport(selectedPassIds, rows);
            lastBatchId = result.batchId;
        } catch (caught) {
            error = caught instanceof Error ? caught.message : 'Commit failed';
        } finally {
            committing = false;
        }
    }

    async function undo() {
        if (lastBatchId == null) return;

        try {
            await revertImport(lastBatchId);
            lastBatchId = null;
        } catch (caught) {
            error = caught instanceof Error ? caught.message : 'Undo failed';
        }
    }

    function rowsToCsv(rows: DraftRow[]): string {
        const header = 'date,opponent,listedPrice,nbTickets,status,invest';
        const body = rows
            .map((row) => [row.date, row.opponent, row.listedPrice, row.nbTickets, row.status, row.invest].join(','))
            .join('\n');

        return `${header}\n${body}\n`;
    }

    function mergeAllocations(fresh: DraftRow[], previous: DraftRow[]): DraftRow[] {
        return fresh.map((row) => {
            const previousRow = previous.find((candidate) => candidate.rowIndex === row.rowIndex);

            if (previousRow == null || previousRow.allocations.length === 0) {
                return row;
            }

            return { ...row, allocations: previousRow.allocations };
        });
    }
</script>

<div class="space-y-4">
    <header class="flex items-center justify-between">
        <p class="text-sm text-neutral-300">
            Season {seasonStartYear}–{seasonStartYear + 1} · {summary.total} rows ·
            <span class="text-red-400">{summary.errors} errors</span> ·
            <span class="text-amber-400">{summary.warnings} warnings</span> ·
            {missing.length} missing
        </p>
        {#if lastBatchId == null}
            <button type="button"
                class="rounded bg-neutral-100 px-4 py-2 text-neutral-900 disabled:opacity-40"
                disabled={summary.errors > 0 || committing}
                onclick={validate}
            >
                {committing ? 'Validating…' : 'Validate import'}
            </button>
        {:else}
            <div class="flex items-center gap-3">
                <span class="text-emerald-400">Imported.</span>
                <button type="button" class="text-sm text-neutral-400 underline" onclick={undo}>Undo</button>
                <button type="button" class="rounded bg-neutral-100 px-4 py-2 text-neutral-900" onclick={onDone}>Done</button>
            </div>
        {/if}
    </header>

    {#if error}
        <p class="text-sm text-red-400">{error}</p>
    {/if}

    <ImportDraftTable {rows} {onRowChange} />
    <ImportMissingMatchesPanel {missing} onAdd={addRowForMatch} />
</div>
```

- [ ] **Step 4: Typecheck**

Run:

```bash
cd web && npm run check && cd ..
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/ui/ImportModalStepReview.svelte web/src/lib/ui/ImportDraftTable.svelte web/src/lib/ui/ImportMissingMatchesPanel.svelte
git commit -m "feat(web): draft review step with inline edits and undo"
```

---

## Task 13: Frontend — entry points on season + sales pages

**Files:**
- Modify: `web/src/routes/(app)/season/+page.svelte`
- Modify: `web/src/routes/(app)/sales/+page.svelte`

- [ ] **Step 1: Add entry point on the season page**

Read the current `+page.svelte`, then in the top toolbar/header area add:

```svelte
<script lang="ts">
    import ImportModal from '$lib/ui/ImportModal.svelte';
    // ... existing imports ...

    let importOpen = $state(false);
    // ... existing state ...
</script>

<!-- inside the existing header/toolbar block: -->
<button type="button" class="rounded border border-neutral-700 px-3 py-1 text-sm" onclick={() => (importOpen = true)}>
    Import sales
</button>

<!-- at the bottom of the file: -->
<ImportModal bind:open={importOpen} passes={data.passes ?? []} />
```

If the `+page.server.ts` for this route does not already load passes, extend it to fetch `GET /season-passes` for the current user and pass them through under `data.passes`. Match the shape `{ id, label, seasonStartYear }`.

- [ ] **Step 2: Add entry point on the global sales page**

Repeat the same pattern in `web/src/routes/(app)/sales/+page.svelte`. Reuse the same `ImportModal` component.

- [ ] **Step 3: Typecheck**

Run:

```bash
cd web && npm run check && cd ..
```

Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run the app and manually walk the flow:

```bash
# terminal 1
npm run start:dev

# terminal 2
cd web && npm run dev
```

1. Log in.
2. Ensure you have at least one `SeasonPasses` row for a season with home matches.
3. Open the season page → click **Import sales**.
4. Select a pass → next → upload a small CSV like:

```csv
date,opponent,listedPrice,nbTickets,status,invest
2025-09-14,Marseille,120,1,SOLD,0
```

5. Confirm the draft renders with `ok`, `Validate import` is enabled, click it.
6. Confirm the toast/inline "Imported" state appears with an **Undo** button.
7. Click **Undo**, confirm the row disappears from the season's sales list.

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/\(app\)/season/+page.svelte web/src/routes/\(app\)/sales/+page.svelte
git commit -m "feat(web): expose import modal on season and sales pages"
```

---

## Task 14: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run:

```bash
npm test
```

Expected: all suites PASS, including the new `sales-import.csv.spec.ts`, `sales-import.resolver.spec.ts`, and `sales-import.service.spec.ts`.

- [ ] **Step 2: Run backend lint + typecheck**

Run:

```bash
npm run lint && npm run typecheck
```

Expected: PASS with 0 warnings.

- [ ] **Step 3: Run web check**

Run:

```bash
cd web && npm run check && cd ..
```

Expected: PASS.

- [ ] **Step 4: Confirm nothing else is uncommitted**

Run:

```bash
git status
```

Expected: `working tree clean` (only the branch pointer moved).
