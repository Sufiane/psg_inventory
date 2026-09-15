# Gifted sale status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `GIFTED` sale status that reports inside unrealized profit alongside `CANCELLED`, backed by a normalized per-user `Recipients` entity created on the fly from the gift flow.

**Architecture:** The accounting layer stops assuming one bucket = one status: `statusConverter` returns a list and the db aggregate filters with `status: { in: … }`, so `unrealized` spans `CANCELLED + GIFTED` while a new `gifted` sub-bucket reports the gift share. Manual status changes move off the `sold` boolean onto an explicit `status` field (with `sold` kept one release as a deprecated alias so backend and web can deploy independently). Recipients are resolved-or-created inside the same `updateSale` call that flips the status — there is no recipient CRUD screen and no `POST /recipients`.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 + Redis (backend, `src/`), SvelteKit 2 + Svelte 5 runes + Tailwind 4 (frontend, `web/`), Jest (backend tests only — `web/` has no test runner).

**Design doc:** `docs/specs/2026-09-11-gifted-sale-status-design.md`

## Global Constraints

- Explicit return types on every backend function/method, including `Promise<void>`.
- `src/` files must never import Prisma outside `src/db/**`. The api layer passes status *names* as string literals.
- Hexagonal split: `*.service.ts` (business logic, no ORM) depends on the db service; the db service is the only file importing Prisma.
- Constructor parameter properties are `readonly`.
- No single-letter variable names except `i`/`j`/`k` in indexed `for` loops. `.catch((error) => …)`, `for (const recipient of recipients)`.
- No inline `if` — always braced, body on its own line.
- Blank line before `if`, `for`, `while`, `return`, `throw` unless it is the first statement in its block.
- No `!!x`; use `x != null` or `Boolean(x)`.
- Delete dead code rather than commenting it out.
- Jest: nest a `describe` per condition ("when …"); `it` titles state only the outcome.
- Exact dependency pinning — no new dependency is needed by this plan; do not add one.
- Conventional-commit messages (commitlint enforced via husky).
- Backend tasks touch **only** `src/` (plus `shared/` in B1 and `scripts/` in B10). Frontend tasks touch **only** `web/`. No task touches both.
- Status name strings are verbatim: `PENDING`, `SOLD`, `CANCELLED`, `GIFTED`.
- UI copy strings are verbatim — copy them character-for-character:
  - `Mark gifted`
  - `Given to`
  - `Recipient`
  - `Records this ticket as given away. Stays out of realized profit.`
  - `Who received it? Type a new name to add them.`
  - `of which gifted`
  - `Gift recipient is required.`

---

## Frozen API contract

Both tracks are written against this contract. It is fixed by the spec — implement it exactly, in both tracks, without renegotiating names.

```ts
// POST /sales/update
type UpdateSaleBody = {
    saleId: string;
    status?: 'PENDING' | 'SOLD' | 'GIFTED';   // preferred
    sold?: boolean;                            // deprecated alias, one release
    recipientId?: string;                      // existing recipient
    recipientName?: string;                    // new or existing, resolved by name
    listedPrice?: number;
    invest?: number;
    allocations?: Array<{ seasonPassId: string; nbTickets: number }>;
};

// GET /recipients
type RecipientListItem = { id: string; name: string; giftCount: number };

// Sale payloads (`GET /sales/*`) gain:
//   giftedAt: string | null
//   Recipient: { id: string; name: string } | null

// TimePeriodAccounting (`GET /accounting/*`) gains:
//   gifted: Accounting | null      // subset of `unrealized`, never a peer total
```

---

## File Structure

**Backend (`src/`, plus `shared/`, `scripts/`)**

| File | Responsibility after this change |
|---|---|
| `shared/src/ids.d.ts` | Adds the `RecipientId` brand. |
| `src/prisma/schema.prisma` | `GIFTED` enum value, `Recipients` model, `Sales.recipientId` / `Sales.giftedAt`, `Users.Recipients` back-relation. |
| `src/prisma/migrations/20260911120000_add_gifted_sale_status/migration.sql` | **New.** Enum label only. |
| `src/prisma/migrations/20260911120100_add_recipients/migration.sql` | **New.** `recipients` table + `sales` columns. |
| `src/api/accounting/types/accounting-status.type.ts` | `AccountingStatus` gains `'gifted'`; exports `SaleStatusName`. |
| `src/api/accounting/utils/status-converter.util.ts` | Bucket name → `SaleStatusName[]`. |
| `src/api/accounting/types/time-period-accounting.type.ts` | `gifted: Accounting \| null`. |
| `src/api/accounting/accounting.service.ts` | Fourth bucket query; `gifted` in result and empty fallback. |
| `src/db/accounting/accounting.db.interface.ts`, `src/db/accounting/accounting.service.ts` | `getAccounting(userId, statuses: SaleStatus[], …)`. |
| `src/db/sales/sales.db.interface.ts` | `getOneByWithFullMatch({ statuses?: SaleStatus[] })`; `updateSale` takes `status` / `recipientId`. |
| `src/db/sales/sales.service.ts` | `status: { in: … }` filter; `giftedAt` + `recipientId` mirror logic. |
| `src/db/sales/sales.query.ts` | Includes `Recipient`. |
| `src/db/recipients/recipients.db.interface.ts`, `src/db/recipients/recipients.service.ts` | **New.** Only file touching `prisma.recipients`. |
| `src/api/recipients/recipients.controller.ts`, `recipients.service.ts`, `recipients.module.ts`, `interfaces/recipients.service.interface.ts`, `types/recipient.type.ts` | **New.** `GET /recipients`. |
| `src/api/sales/dto/update-sale.dto.ts` | `status`, `recipientId`, `recipientName`, deprecated `sold`. |
| `src/api/sales/sales.service.ts` | Transition rules, kickoff guard scoped to `SOLD`, recipient resolve-or-create. |
| `src/common/exceptions/error-codes.enum.ts` | `SALE_GIFT_RECIPIENT_REQUIRED`. |
| `src/redis/CACHE_KEYS.ts` | `accounting` key `:v2`; `recipients` key + invalidation. |
| `src/api/sales-import/sales-import.csv.ts` | `GIFTED` in `SALE_ROW_STATUSES`. |
| `src/api/ask/types/context.type.ts`, `src/api/ask/context/build-context.ts`, `src/api/ask/prompts/system-prompt.ts` | Expose and explain `gifted ⊂ unrealized`. |
| `scripts/seed-demo.ts` | Seeds one recipient and two gifted sales. |

**Frontend (`web/`)**

| File | Responsibility after this change |
|---|---|
| `web/src/lib/types.ts` | `SaleStatus` + `'GIFTED'`; `giftedAt` / `Recipient` on sale types; `gifted` on `TimePeriodAccounting`; `RecipientListItem`. |
| `web/src/lib/types/sales-import.ts` | `SaleStatus` + `'GIFTED'`. |
| `web/src/app.css` | `--color-gift` / `--color-gift-strong` in both themes. |
| `web/src/routes/(app)/sales/+page.server.ts` | Loads recipients; sends `status` / `recipientName`. |
| `web/src/routes/(app)/sales/+page.svelte` | `GIFTED` pill + tone; "Mark gifted" block with recipient combobox. |
| `web/src/routes/(app)/sales/[saleId]/+page.server.ts` | Sends `status` / `recipientName`. |
| `web/src/routes/(app)/sales/[saleId]/+page.svelte` | `GIFTED` tone; recipient and gifted-at rows. |
| `web/src/lib/ui/ImportSalesDraft.svelte` | `GIFTED` option in the status select. |
| `web/src/lib/ui/AccountingCard.svelte` | Optional `footnote` slot line. |
| `web/src/routes/(app)/accounting/+page.svelte`, `web/src/routes/(app)/dashboard/+page.svelte` | "of which gifted" under Unrealized. |

---

## Track B — Backend (`src/` only)

### Task B1: Schema, migrations, and the `RecipientId` brand

**Files:**
- Modify: `shared/src/ids.d.ts`
- Modify: `src/prisma/schema.prisma`
- Create: `src/prisma/migrations/20260911120000_add_gifted_sale_status/migration.sql`
- Create: `src/prisma/migrations/20260911120100_add_recipients/migration.sql`

**Interfaces:**
- Produces: Prisma `SaleStatus.GIFTED`; `prisma.recipients` model; `Sales.recipientId`, `Sales.giftedAt`; `RecipientId` brand.

- [ ] **Step 1: Add the brand**

In `shared/src/ids.d.ts`, after `SalePassAllocationId`:

```ts
export type RecipientId = Brand<string, 'RecipientId'>;
```

- [ ] **Step 2: Edit the schema**

In `src/prisma/schema.prisma`:

```prisma
enum SaleStatus {
  PENDING
  SOLD
  CANCELLED
  GIFTED
}

model Recipients {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  name      String
  User      Users    @relation(fields: [userId], references: [id])
  Sales     Sales[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt() @map("updated_at")

  @@unique([userId, name])
  @@index([userId])
  @@map("recipients")
}
```

Add to `model Users`: `Recipients   Recipients[]`.

Add to `model Sales`, next to `cancelledAt`:

```prisma
  giftedAt    DateTime?       @map("gifted_at")
  recipientId String?         @map("recipient_id")
  Recipient   Recipients?     @relation(fields: [recipientId], references: [id])
```

and the index line next to the existing `@@index`:

```prisma
  @@index([recipientId])
```

- [ ] **Step 3: Write the enum migration**

`src/prisma/migrations/20260911120000_add_gifted_sale_status/migration.sql` — this file contains this statement and nothing else. PostgreSQL cannot *use* a new enum label in the transaction that adds it, and Prisma runs one transaction per migration file.

```sql
ALTER TYPE "SaleStatus" ADD VALUE 'GIFTED';
```

- [ ] **Step 4: Write the recipients migration**

`src/prisma/migrations/20260911120100_add_recipients/migration.sql`:

```sql
CREATE TABLE "recipients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recipients_user_id_idx" ON "recipients"("user_id");

CREATE UNIQUE INDEX "recipients_user_id_name_key" ON "recipients"("user_id", "name");

ALTER TABLE "recipients" ADD CONSTRAINT "recipients_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales" ADD COLUMN "gifted_at" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "recipient_id" TEXT;

CREATE INDEX "sales_recipient_id_idx" ON "sales"("recipient_id");

ALTER TABLE "sales" ADD CONSTRAINT "sales_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Apply and verify against the local database**

```bash
npm run local:db:up
npx prisma migrate deploy
npx prisma generate
npm run typecheck
```

Expected: `2 migrations applied`, generate succeeds, typecheck passes.

- [ ] **Step 6: Verify Prisma agrees the schema matches the database**

```bash
npx prisma migrate diff --from-schema-datamodel src/prisma/schema.prisma --to-schema-datasource src/prisma/schema.prisma --exit-code
```

Expected: exit code 0 ("No difference detected").

- [ ] **Step 7: Commit**

```bash
git add shared/src/ids.d.ts src/prisma/schema.prisma src/prisma/migrations
git commit -m "feat(sales): add GIFTED status and recipients schema"
```

---

### Task B2: `statusConverter` returns a status list

**Files:**
- Modify: `src/api/accounting/types/accounting-status.type.ts`
- Modify: `src/api/accounting/utils/status-converter.util.ts`
- Test: `src/api/accounting/utils/status-converter.util.spec.ts`

**Interfaces:**
- Consumes: nothing from B1 at type level (string literals only).
- Produces: `type SaleStatusName = 'PENDING' | 'SOLD' | 'CANCELLED' | 'GIFTED'`; `type AccountingStatus = 'realized' | 'pending' | 'unrealized' | 'gifted'`; `statusConverter(status: AccountingStatus): SaleStatusName[]`.

- [ ] **Step 1: Write the failing test**

Replace the body of `src/api/accounting/utils/status-converter.util.spec.ts` with:

```ts
import { statusConverter } from './status-converter.util';

describe('statusConverter', () => {
    describe('when the bucket is realized', () => {
        it('returns SOLD only', () => {
            expect(statusConverter('realized')).toEqual(['SOLD']);
        });
    });

    describe('when the bucket is pending', () => {
        it('returns PENDING only', () => {
            expect(statusConverter('pending')).toEqual(['PENDING']);
        });
    });

    describe('when the bucket is unrealized', () => {
        it('spans CANCELLED and GIFTED', () => {
            expect(statusConverter('unrealized')).toEqual(['CANCELLED', 'GIFTED']);
        });
    });

    describe('when the bucket is gifted', () => {
        it('returns GIFTED only', () => {
            expect(statusConverter('gifted')).toEqual(['GIFTED']);
        });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/api/accounting/utils/status-converter.util.spec.ts`
Expected: FAIL — `statusConverter('realized')` returns the string `'SOLD'`, not `['SOLD']`.

- [ ] **Step 3: Implement**

`src/api/accounting/types/accounting-status.type.ts`:

```ts
// The accounting view exposes four buckets; these are the api-side names.
// `gifted` is a SUBSET of `unrealized`, not a peer total — every consumer that
// renders both must say so. Mapped to db SaleStatus values by statusConverter.
export type AccountingStatus = 'realized' | 'pending' | 'unrealized' | 'gifted';

// The db SaleStatus enum values, as plain literals. The api layer never
// imports Prisma; Prisma's SaleStatus is a string enum with these exact
// members, so the db layer accepts them unchanged.
export type SaleStatusName = 'PENDING' | 'SOLD' | 'CANCELLED' | 'GIFTED';
```

`src/api/accounting/utils/status-converter.util.ts`:

```ts
import type { AccountingStatus, SaleStatusName } from '../types/accounting-status.type';

// A bucket can span several db statuses: a gifted ticket produced no cash, so
// it belongs to `unrealized` alongside `CANCELLED`, while `gifted` reports the
// gift share of that same total.
export function statusConverter(status: AccountingStatus): SaleStatusName[] {
    switch (status) {
        case 'pending':
            return ['PENDING'];
        case 'realized':
            return ['SOLD'];
        case 'unrealized':
            return ['CANCELLED', 'GIFTED'];
        case 'gifted':
            return ['GIFTED'];
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/api/accounting/utils/status-converter.util.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/accounting/types/accounting-status.type.ts src/api/accounting/utils/status-converter.util.ts src/api/accounting/utils/status-converter.util.spec.ts
git commit -m "feat(accounting): map accounting buckets to status lists"
```

---

### Task B3: db layer filters on a status list

**Files:**
- Modify: `src/db/accounting/accounting.db.interface.ts`
- Modify: `src/db/accounting/accounting.service.ts:17-53`
- Modify: `src/db/sales/sales.db.interface.ts:40-49`
- Modify: `src/db/sales/sales.service.ts:271-303`

**Interfaces:**
- Consumes: `SaleStatusName[]` from B2 (arrives as `SaleStatus[]` at the db boundary).
- Produces: `getAccounting(userId: UserId, statuses: SaleStatus[], from: Date, to?: Date)`; `getOneByWithFullMatch({ statuses?: SaleStatus[], … })`.

- [ ] **Step 1: Change the accounting db contract**

`src/db/accounting/accounting.db.interface.ts`:

```ts
    abstract getAccounting(
        userId: UserId,
        statuses: SaleStatus[],
        from: Date,
        to?: Date,
    ): Promise<AccountingAggregate | null>;
```

- [ ] **Step 2: Change the accounting db implementation**

`src/db/accounting/accounting.service.ts` — signature and the `where` clause only:

```ts
    async getAccounting(
        userId: UserId,
        statuses: SaleStatus[],
        from: Date,
        to?: Date,
    ): Promise<AccountingAggregate | null> {
```

```ts
            where: {
                userId,
                status: { in: statuses },
                Match: {
                    date: matchDateFilter,
                },
            },
```

- [ ] **Step 3: Change the sales db contract and implementation**

In `src/db/sales/sales.db.interface.ts`, replace `status?: SaleStatus;` with `statuses?: SaleStatus[];` inside `getOneByWithFullMatch`'s query type.

In `src/db/sales/sales.service.ts`, `getOneByWithFullMatch` destructures the new key and builds an `in` filter:

```ts
    getOneByWithFullMatch(query: {
        profit?: Profit;
        listedPrice?: ListedPrice;
        invest?: Invest;
        nbTickets?: TicketCount;
        statuses?: SaleStatus[];
        userId: UserId;
        matchDateFrom: Date;
        matchDateTo?: Date;
    }): Promise<SaleWithFullMatch> {
        const { matchDateFrom, matchDateTo, statuses, ...saleFields } = query;

        return this.prisma.sales.findFirstOrThrow({
            include: {
                Match: {
                    include: {
                        Opponent: true,
                    },
                },
            },
            where: {
                ...saleFields,
                ...(statuses != null ? { status: { in: statuses } } : {}),
                Match: {
                    date: buildInclusiveDateRangeFilter(matchDateFrom, matchDateTo),
                },
            },
            orderBy: {
                Match: {
                    date: 'asc',
                },
            },
        }) as unknown as Promise<SaleWithFullMatch>;
    }
```

- [ ] **Step 4: Verify the compiler catches every caller**

Run: `npm run typecheck`
Expected: FAIL, with errors only in `src/api/accounting/accounting.service.ts` (the `statusConverter(status)` call sites) — those are fixed in B4. Record the error list; no other file should appear.

- [ ] **Step 5: Commit**

```bash
git add src/db/accounting src/db/sales/sales.db.interface.ts src/db/sales/sales.service.ts
git commit -m "refactor(db): filter accounting aggregates on a status list"
```

---

### Task B4: `gifted` bucket, cache key bump, and ask context

**Files:**
- Modify: `src/api/accounting/types/time-period-accounting.type.ts`
- Modify: `src/api/accounting/accounting.service.ts:66-209`
- Modify: `src/redis/CACHE_KEYS.ts:10-15`
- Modify: `src/api/ask/types/context.type.ts:46-60`
- Modify: `src/api/ask/context/build-context.ts:88-99`
- Modify: `src/api/ask/prompts/system-prompt.ts:14`
- Test: `src/api/accounting/accounting.service.spec.ts`, `src/api/ask/context/build-context.spec.ts`, `src/api/ask/ask.service.spec.ts`

**Interfaces:**
- Consumes: `statusConverter` (B2), `getAccounting(userId, statuses, …)` (B3).
- Produces: `TimePeriodAccounting.gifted: Accounting | null`; `AskPeriod.gifted: AskAccounting | null`.

- [ ] **Step 1: Write the failing tests**

In `src/api/accounting/accounting.service.spec.ts`, inside the existing `getSeason` describe, add:

```ts
    describe('when the period has gifted sales', () => {
        it('returns the gifted sub-bucket alongside unrealized', async () => {
            const realized = {} as Accounting;
            const unrealized = {} as Accounting;
            const pending = {} as Accounting;
            const gifted = {} as Accounting;

            jest.spyOn(service, 'getAccounting')
                .mockResolvedValueOnce(realized)
                .mockResolvedValueOnce(unrealized)
                .mockResolvedValueOnce(pending)
                .mockResolvedValueOnce(gifted);

            const result = await service.getSeason(userId, dates, 2025 as SeasonYear);

            expect(result.gifted).toBe(gifted);
            expect(result.unrealized).toBe(unrealized);
        });
    });
```

Every existing assertion in that file that builds an empty `TimePeriodAccounting` (the `unrealized: null` object literals around lines 89, 125, 157) gains `gifted: null`. Same for `src/api/ask/ask.service.spec.ts:28` and `src/api/ask/context/build-context.spec.ts:9,45`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/api/accounting src/api/ask`
Expected: FAIL — `result.gifted` is `undefined`, plus type errors on the literals that now declare `gifted`.

- [ ] **Step 3: Add the field to the type**

`src/api/accounting/types/time-period-accounting.type.ts`:

```ts
export type TimePeriodAccounting = {
    realized: Accounting | null;
    unrealized: Accounting | null;
    pending: Accounting | null;
    // Subset of `unrealized`, not a peer total: a gifted ticket is already
    // counted there. Render it as a breakdown line, never as its own total.
    gifted: Accounting | null;
    seasonInvestments: SeasonInvestment[];
    totalSeasonInvestment: number;
    leadTime: LeadTime | null;
};
```

- [ ] **Step 4: Query the fourth bucket**

In `src/api/accounting/accounting.service.ts`, `getAccounting` passes the list straight through — `statusConverter(status)` now returns `SaleStatusName[]`, so both call sites (the db call and the `scope` object) change key and shape:

```ts
        const aggregate = await this.accountingDbService.getAccounting(
            userId,
            statusConverter(status),
            date.start,
            date.end,
        );

        if (!aggregate) {
            return null;
        }

        const scope = {
            statuses: statusConverter(status),
            userId,
            matchDateFrom: date.start,
            ...(date.end ? { matchDateTo: date.end } : {}),
        };
```

In `getSeason`, add the fourth query and field (destructuring order must match the `Promise.all` order):

```ts
                const [
                    realizedAccounting,
                    unrealizedAccounting,
                    pendingAccounting,
                    giftedAccounting,
                    seasonPasses,
                    allPasses,
                    leadTimes,
                ] = await Promise.all([
                    this.getAccounting(userId, 'realized', dates),
                    this.getAccounting(userId, 'unrealized', dates),
                    this.getAccounting(userId, 'pending', dates),
                    this.getAccounting(userId, 'gifted', dates),
                    seasonStartYear !== null
                        ? this.seasonPassesDbService.findBySeason(userId, seasonStartYear)
                        : Promise.resolve([]),
                    seasonStartYear === null
                        ? this.seasonPassesDbService.findAll(userId)
                        : Promise.resolve([]),
                    this.accountingDbService.getSoldLeadTimes(
                        userId,
                        dates.start,
                        dates.end,
                    ),
                ]);
```

```ts
                const result: TimePeriodAccounting = {
                    realized: realizedAccounting,
                    unrealized: unrealizedAccounting,
                    pending: pendingAccounting,
                    gifted: giftedAccounting,
                    seasonInvestments,
                    totalSeasonInvestment,
                    leadTime: computeLeadTime(leadTimes),
                };
```

and the empty fallback gains `gifted: null`.

- [ ] **Step 5: Bump the accounting cache key**

`src/redis/CACHE_KEYS.ts` — cached `TimePeriodAccounting` payloads have a one-day TTL and predate `gifted`; without this, a warm cache serves `gifted: undefined` for up to 24h after deploy. The `invalidateAccounting` pattern still matches because the prefix is unchanged.

```ts
    accounting: (
        userId: string,
        start: Date,
        end?: Date,
    ): CacheKey<TimePeriodAccounting> =>
        `accounting:user:id:${userId}:v2:start:${start.toISOString()}:end:${end?.toISOString()}` as CacheKey<TimePeriodAccounting>,
```

- [ ] **Step 6: Expose it to the ask context**

`src/api/ask/types/context.type.ts` — add to `AskPeriod`, under `unrealized`:

```ts
    // Subset of `unrealized`: tickets given away rather than sold.
    gifted: AskAccounting | null;
```

`src/api/ask/context/build-context.ts` — in `toPeriod`, under `unrealized`:

```ts
        gifted: toAccounting(period.gifted),
```

`src/api/ask/prompts/system-prompt.ts:14` — replace the sentence that defines the buckets with:

```ts
- "realized" means sales that completed and were paid. "unrealized" means listed value not yet sold. "pending" means sales in progress. "gifted" is a subset of "unrealized" — tickets given to someone instead of sold; never add it to "unrealized", it is already included there.
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx jest src/api/accounting src/api/ask`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/api/accounting src/api/ask src/redis/CACHE_KEYS.ts
git commit -m "feat(accounting): report gifted sales inside unrealized"
```

---

### Task B5: recipients db layer

**Files:**
- Create: `src/db/recipients/recipients.db.interface.ts`
- Create: `src/db/recipients/recipients.service.ts`
- Create: `src/db/recipients/type/recipient.type.ts`
- Modify: `src/db/db.module.ts`
- Modify: `src/redis/CACHE_KEYS.ts`
- Test: `src/db/recipients/recipients.service.spec.ts`

**Interfaces:**
- Consumes: `prisma.recipients` (B1), `RecipientId` brand (B1).
- Produces:
  - `IRecipientsDbService.listForUser(userId: UserId): Promise<RecipientWithGiftCount[]>`
  - `IRecipientsDbService.findByNameForUser(userId: UserId, name: string): Promise<Recipient | null>`
  - `IRecipientsDbService.create(userId: UserId, name: string): Promise<Recipient>`
  - `type Recipient = { id: RecipientId; userId: UserId; name: string }`
  - `type RecipientWithGiftCount = Recipient & { giftCount: number }`

- [ ] **Step 1: Write the failing test**

`src/db/recipients/recipients.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import type { UserId } from '@psg/shared/ids';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../../redis/redis.service';
import { RecipientsService } from './recipients.service';

describe('RecipientsService (db)', () => {
    const userId = 'user-1' as UserId;
    let service: RecipientsService;
    let prisma: { recipients: Record<string, jest.Mock> };
    let redis: { get: jest.Mock; invalidatePattern: jest.Mock };

    beforeEach(async () => {
        prisma = {
            recipients: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };
        redis = {
            get: jest.fn((_key: string, _ttl: number, loader: () => unknown) => loader()),
            invalidatePattern: jest.fn().mockResolvedValue(undefined),
        };

        const moduleRef = await Test.createTestingModule({
            providers: [
                RecipientsService,
                { provide: PrismaService, useValue: prisma },
                { provide: RedisService, useValue: redis },
            ],
        }).compile();

        service = moduleRef.get(RecipientsService);
    });

    describe('when listing a user', () => {
        it('returns recipients with their gift count, most-gifted first', async () => {
            prisma.recipients.findMany.mockResolvedValue([
                { id: 'r1', userId, name: 'Marc', _count: { Sales: 3 } },
                { id: 'r2', userId, name: 'Ana', _count: { Sales: 1 } },
            ]);

            const result = await service.listForUser(userId);

            expect(result).toEqual([
                { id: 'r1', userId, name: 'Marc', giftCount: 3 },
                { id: 'r2', userId, name: 'Ana', giftCount: 1 },
            ]);
            expect(prisma.recipients.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId } }),
            );
        });
    });

    describe('when looking a recipient up by name', () => {
        it('matches case-insensitively within the user scope', async () => {
            prisma.recipients.findFirst.mockResolvedValue({
                id: 'r1',
                userId,
                name: 'Marc',
            });

            const result = await service.findByNameForUser(userId, 'marc');

            expect(result).toEqual({ id: 'r1', userId, name: 'Marc' });
            expect(prisma.recipients.findFirst).toHaveBeenCalledWith({
                where: { userId, name: { equals: 'marc', mode: 'insensitive' } },
                select: { id: true, userId: true, name: true },
            });
        });
    });

    describe('when creating a recipient', () => {
        it('invalidates the cached list for that user', async () => {
            prisma.recipients.create.mockResolvedValue({
                id: 'r9',
                userId,
                name: 'Chloé',
            });

            await service.create(userId, 'Chloé');

            expect(redis.invalidatePattern).toHaveBeenCalledWith(
                `user:id:${userId}:recipients*`,
            );
        });
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/db/recipients`
Expected: FAIL — `Cannot find module './recipients.service'`.

- [ ] **Step 3: Add the cache keys**

`src/redis/CACHE_KEYS.ts` — import the type and add two entries (keep the object's existing ordering style):

```ts
import type { RecipientWithGiftCount } from '../db/recipients/type/recipient.type';
```

```ts
    recipients: (userId: string): CacheKey<RecipientWithGiftCount[]> =>
        `user:id:${userId}:recipients` as CacheKey<RecipientWithGiftCount[]>,
    invalidateRecipients: (userId: string): CacheKeyPattern =>
        `user:id:${userId}:recipients*` as CacheKeyPattern,
```

- [ ] **Step 4: Write the types and the contract**

`src/db/recipients/type/recipient.type.ts`:

```ts
import type { RecipientId, UserId } from '@psg/shared/ids';

export type Recipient = {
    id: RecipientId;
    userId: UserId;
    name: string;
};

export type RecipientWithGiftCount = Recipient & {
    giftCount: number;
};
```

`src/db/recipients/recipients.db.interface.ts`:

```ts
import type { UserId } from '@psg/shared/ids';
import { Recipient, RecipientWithGiftCount } from './type/recipient.type';

export abstract class IRecipientsDbService {
    abstract listForUser(userId: UserId): Promise<RecipientWithGiftCount[]>;
    abstract findByNameForUser(userId: UserId, name: string): Promise<Recipient | null>;
    abstract create(userId: UserId, name: string): Promise<Recipient>;
}
```

- [ ] **Step 5: Implement the service**

`src/db/recipients/recipients.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';

import type { UserId } from '@psg/shared/ids';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { PrismaService } from '../prisma.service';
import { IRecipientsDbService } from './recipients.db.interface';
import { Recipient, RecipientWithGiftCount } from './type/recipient.type';

@Injectable()
export class RecipientsService implements IRecipientsDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async listForUser(userId: UserId): Promise<RecipientWithGiftCount[]> {
        const result = await this.redisService.get(
            CACHE_KEYS.recipients(userId),
            ONE_HOUR_TTL,
            async () => {
                const rows = await this.prisma.recipients.findMany({
                    where: { userId },
                    select: {
                        id: true,
                        userId: true,
                        name: true,
                        _count: { select: { Sales: { where: { status: SaleStatus.GIFTED } } } },
                    },
                    orderBy: { name: 'asc' },
                });

                return rows.map((row) => ({
                    id: row.id,
                    userId: row.userId,
                    name: row.name,
                    giftCount: row._count.Sales,
                })) as RecipientWithGiftCount[];
            },
        );

        return result ?? [];
    }

    findByNameForUser(userId: UserId, name: string): Promise<Recipient | null> {
        return this.prisma.recipients.findFirst({
            where: { userId, name: { equals: name, mode: 'insensitive' } },
            select: { id: true, userId: true, name: true },
        }) as Promise<Recipient | null>;
    }

    async create(userId: UserId, name: string): Promise<Recipient> {
        const created = await this.prisma.recipients.create({
            data: { userId, name },
            select: { id: true, userId: true, name: true },
        });

        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateRecipients(userId));

        return created as Recipient;
    }
}
```

Note on ordering: the db returns names alphabetically and the api layer (B6) does the
most-gifted-first sort, because `_count` is not an orderable field here.

- [ ] **Step 6: Register the provider**

`src/db/db.module.ts` — add the import, the provider entry, and the export entry:

```ts
        { provide: IRecipientsDbService, useClass: RecipientsService },
```

```ts
        IRecipientsDbService,
```

- [ ] **Step 7: Run the tests**

Run: `npx jest src/db/recipients`
Expected: PASS, 3 tests. The list test asserts the mapped shape; the service sorts by name and B6 re-sorts by gift count.

- [ ] **Step 8: Commit**

```bash
git add src/db/recipients src/db/db.module.ts src/redis/CACHE_KEYS.ts
git commit -m "feat(recipients): add recipients data layer"
```

---

### Task B6: `GET /recipients`

**Files:**
- Create: `src/api/recipients/types/recipient.type.ts`
- Create: `src/api/recipients/interfaces/recipients.service.interface.ts`
- Create: `src/api/recipients/recipients.service.ts`
- Create: `src/api/recipients/recipients.controller.ts`
- Create: `src/api/recipients/recipients.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/api/recipients/recipients.service.spec.ts`

**Interfaces:**
- Consumes: `IRecipientsDbService` (B5).
- Produces: `IRecipientsService.list(userId: UserId): Promise<RecipientListItem[]>` where `RecipientListItem = { id: RecipientId; name: string; giftCount: number }`; route `GET /recipients`.

- [ ] **Step 1: Write the failing test**

`src/api/recipients/recipients.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import type { RecipientId, UserId } from '@psg/shared/ids';
import { IRecipientsDbService } from '../../db/recipients/recipients.db.interface';
import { RecipientsService } from './recipients.service';

describe('RecipientsService (api)', () => {
    const userId = 'user-1' as UserId;
    let service: RecipientsService;
    let db: { listForUser: jest.Mock };

    beforeEach(async () => {
        db = { listForUser: jest.fn() };

        const moduleRef = await Test.createTestingModule({
            providers: [RecipientsService, { provide: IRecipientsDbService, useValue: db }],
        }).compile();

        service = moduleRef.get(RecipientsService);
    });

    describe('when the user has recipients', () => {
        it('orders them by gift count then name', async () => {
            db.listForUser.mockResolvedValue([
                { id: 'r1' as RecipientId, userId, name: 'Ana', giftCount: 1 },
                { id: 'r2' as RecipientId, userId, name: 'Marc', giftCount: 3 },
                { id: 'r3' as RecipientId, userId, name: 'Bo', giftCount: 1 },
            ]);

            const result = await service.list(userId);

            expect(result).toEqual([
                { id: 'r2', name: 'Marc', giftCount: 3 },
                { id: 'r1', name: 'Ana', giftCount: 1 },
                { id: 'r3', name: 'Bo', giftCount: 1 },
            ]);
        });
    });

    describe('when the user has no recipients', () => {
        it('returns an empty list', async () => {
            db.listForUser.mockResolvedValue([]);

            await expect(service.list(userId)).resolves.toEqual([]);
        });
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/api/recipients`
Expected: FAIL — `Cannot find module './recipients.service'`.

- [ ] **Step 3: Implement the type, contract, and service**

`src/api/recipients/types/recipient.type.ts`:

```ts
import type { RecipientId } from '@psg/shared/ids';

export type RecipientListItem = {
    id: RecipientId;
    name: string;
    giftCount: number;
};
```

`src/api/recipients/interfaces/recipients.service.interface.ts`:

```ts
import type { UserId } from '@psg/shared/ids';
import { RecipientListItem } from '../types/recipient.type';

export abstract class IRecipientsService {
    abstract list(userId: UserId): Promise<RecipientListItem[]>;
}
```

`src/api/recipients/recipients.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { UserId } from '@psg/shared/ids';
import { IRecipientsDbService } from '../../db/recipients/recipients.db.interface';
import { IRecipientsService } from './interfaces/recipients.service.interface';
import { RecipientListItem } from './types/recipient.type';

@Injectable()
export class RecipientsService implements IRecipientsService {
    constructor(private readonly recipientsDbService: IRecipientsDbService) {}

    async list(userId: UserId): Promise<RecipientListItem[]> {
        const recipients = await this.recipientsDbService.listForUser(userId);

        // Most-gifted first: the combobox should offer the people this user
        // actually gives tickets to before the one-off from two seasons ago.
        return recipients
            .map((recipient) => ({
                id: recipient.id,
                name: recipient.name,
                giftCount: recipient.giftCount,
            }))
            .sort((first, second) => {
                if (first.giftCount !== second.giftCount) {
                    return second.giftCount - first.giftCount;
                }

                return first.name.localeCompare(second.name);
            });
    }
}
```

- [ ] **Step 4: Add the controller and module, and register it**

`src/api/recipients/recipients.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

import { User } from '../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { IRecipientsService } from './interfaces/recipients.service.interface';
import { RecipientListItem } from './types/recipient.type';

@Controller('recipients')
export class RecipientsController {
    constructor(private readonly service: IRecipientsService) {}

    @Get('/')
    async list(@User() user: AuthenticatedUser): Promise<RecipientListItem[]> {
        return await this.service.list(user.id);
    }
}
```

`src/api/recipients/recipients.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { DbModule } from '../../db/db.module';
import { RedisModule } from '../../redis/redis.module';
import { IRecipientsService } from './interfaces/recipients.service.interface';
import { RecipientsController } from './recipients.controller';
import { RecipientsService } from './recipients.service';

@Module({
    imports: [DbModule, RedisModule],
    controllers: [RecipientsController],
    providers: [{ provide: IRecipientsService, useClass: RecipientsService }],
    exports: [IRecipientsService],
})
export class RecipientsModule {}
```

In `src/app.module.ts`, import `RecipientsModule` and add it to the `imports` array after `SeasonPassesModule`.

- [ ] **Step 5: Run the tests and the app boot check**

Run: `npx jest src/api/recipients && npm run build`
Expected: PASS, 2 tests; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/api/recipients src/app.module.ts
git commit -m "feat(recipients): expose GET /recipients"
```

---

### Task B7: explicit status transitions and recipient resolve-or-create

**Files:**
- Modify: `src/api/sales/dto/update-sale.dto.ts`
- Modify: `src/api/sales/sales.service.ts:96-128`
- Modify: `src/common/exceptions/error-codes.enum.ts`
- Modify: `src/db/sales/sales.db.interface.ts:29-38`
- Modify: `src/db/sales/sales.service.ts:144-245`
- Test: `src/api/sales/sales.service.spec.ts`

**Interfaces:**
- Consumes: `IRecipientsDbService.findByNameForUser` / `.create` (B5).
- Produces: `UpdateSaleDto` with `status?: SaleStatusTarget`, `recipientId?: RecipientId`, `recipientName?: string`, deprecated `sold?: boolean`; `type SaleStatusTarget = 'PENDING' | 'SOLD' | 'GIFTED'`; db `updateSale({ …, status?: SaleStatus, recipientId?: RecipientId | null })`.

- [ ] **Step 1: Write the failing tests**

Add to `src/api/sales/sales.service.spec.ts` (the file already builds a `SalesService` with mocked db services — add `IRecipientsDbService` to that testing module as `{ findByNameForUser: jest.fn(), create: jest.fn() }`):

```ts
    describe('updateSale status transitions', () => {
        describe('when the target is SOLD and the match has kicked off', () => {
            it('rejects the update', async () => {
                salesDb.getOneSale.mockResolvedValue({
                    ...existingSale,
                    Match: { date: new Date(Date.now() - 60_000) },
                });

                await expect(
                    service.updateSale(userId, { saleId, status: 'SOLD' } as UpdateSaleDto),
                ).rejects.toMatchObject({ code: ErrorCode.SALE_AFTER_KICKOFF });
            });
        });

        describe('when the target is GIFTED and the match has kicked off', () => {
            it('allows the update', async () => {
                salesDb.getOneSale.mockResolvedValue({
                    ...existingSale,
                    Match: { date: new Date(Date.now() - 60_000) },
                });
                recipientsDb.findByNameForUser.mockResolvedValue({
                    id: 'r1',
                    userId,
                    name: 'Marc',
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(salesDb.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'GIFTED', recipientId: 'r1' }),
                );
            });
        });

        describe('when the target is GIFTED with no recipient', () => {
            it('rejects the update', async () => {
                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED,
                });
            });
        });

        describe('when the recipient name is new', () => {
            beforeEach(() => {
                recipientsDb.findByNameForUser.mockResolvedValue(null);
                recipientsDb.create.mockResolvedValue({ id: 'r2', userId, name: 'Chloé' });
            });

            it('creates the recipient with the trimmed name', async () => {
                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: '  Chloé  ',
                } as UpdateSaleDto);

                expect(recipientsDb.create).toHaveBeenCalledWith(userId, 'Chloé');
                expect(salesDb.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ recipientId: 'r2' }),
                );
            });
        });

        describe('when the target is not GIFTED', () => {
            it('clears the recipient', async () => {
                await service.updateSale(userId, {
                    saleId,
                    status: 'PENDING',
                } as UpdateSaleDto);

                expect(salesDb.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'PENDING', recipientId: null }),
                );
            });
        });

        describe('when only the deprecated sold flag is sent', () => {
            it('still maps to SOLD', async () => {
                await service.updateSale(userId, { saleId, sold: true } as UpdateSaleDto);

                expect(salesDb.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'SOLD' }),
                );
            });
        });

        describe('when both status and the deprecated sold flag are sent', () => {
            it('lets status win', async () => {
                recipientsDb.findByNameForUser.mockResolvedValue({
                    id: 'r1',
                    userId,
                    name: 'Marc',
                });

                await service.updateSale(userId, {
                    saleId,
                    sold: true,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(salesDb.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'GIFTED' }),
                );
            });
        });
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest src/api/sales/sales.service.spec.ts`
Expected: FAIL — `status` is not a known property and `SALE_GIFT_RECIPIENT_REQUIRED` does not exist.

- [ ] **Step 3: Add the error code**

`src/common/exceptions/error-codes.enum.ts`, after `SALE_ALLOCATION_PASS_MISMATCH`:

```ts
    SALE_GIFT_RECIPIENT_REQUIRED = 'sale_gift_recipient_required',
```

- [ ] **Step 4: Widen the DTO**

`src/api/sales/dto/update-sale.dto.ts`:

```ts
import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { RecipientId, SaleId } from '@psg/shared/ids';
import { AddSaleDto } from './add-sale.dto';

export type SaleStatusTarget = 'PENDING' | 'SOLD' | 'GIFTED';

const SALE_STATUS_TARGETS: SaleStatusTarget[] = ['PENDING', 'SOLD', 'GIFTED'];

export class UpdateSaleDto extends PartialType(AddSaleDto) {
    @IsString()
    saleId!: SaleId;

    @IsOptional()
    @IsIn(SALE_STATUS_TARGETS)
    status?: SaleStatusTarget;

    /** @deprecated Use `status`. Kept one release so the web app and the api
     *  can deploy independently; `status` wins when both are present. */
    @IsOptional()
    @IsBoolean()
    sold?: boolean;

    @IsOptional()
    @IsUUID()
    recipientId?: RecipientId;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    recipientName?: string;
}
```

`CANCELLED` is deliberately absent: it stays owned by the `cancel-sales` cron.

- [ ] **Step 5: Implement the transition rules**

`src/api/sales/sales.service.ts` — add these imports at the top:

```ts
import type { RecipientId } from '@psg/shared/ids';
import { IRecipientsDbService } from '../../db/recipients/recipients.db.interface';
import { SaleStatusTarget, UpdateSaleDto } from './dto/update-sale.dto';
```

(`UpdateSaleDto` is already imported — extend that import with `SaleStatusTarget` rather than duplicating it.)

Then inject the recipients db service and replace the body of `updateSale`:

```ts
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly matchesDbService: IMatchesDbService,
        private readonly seasonPassesDbService: ISeasonPassesDbService,
        private readonly recipientsDbService: IRecipientsDbService,
        private readonly redisService: RedisService,
    ) {}
```

```ts
    async updateSale(userId: UserId, payload: UpdateSaleDto): Promise<void> {
        const existing = await this.salesDbService.getOneSale(userId, payload.saleId);

        if (!existing) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        const target = resolveTargetStatus(payload);

        // A sale can't be marked SOLD after the match has kicked off. GIFTED has
        // no such guard on purpose: the cron cancels unsold listings overnight,
        // so "I actually gave that one away" is normally recorded afterwards.
        if (target === 'SOLD' && existing.Match.date.getTime() <= Date.now()) {
            throw new DomainException(ErrorCode.SALE_AFTER_KICKOFF);
        }

        if (payload.allocations != null) {
            await this.validateAllocations(userId, existing.matchId, payload.allocations);
        }

        const recipientPatch =
            target === undefined
                ? {}
                : { recipientId: await this.resolveRecipient(userId, target, payload) };

        await this.salesDbService.updateSale({
            saleId: payload.saleId,
            userId,
            ...(target !== undefined ? { status: target } : {}),
            ...recipientPatch,
            profit: payload.listedPrice ? this.getProfit(payload.listedPrice) : undefined,
            ...(payload.invest !== undefined ? { invest: payload.invest } : {}),
            ...(payload.listedPrice !== undefined
                ? { listedPrice: payload.listedPrice }
                : {}),
            ...(payload.allocations ? { allocations: payload.allocations } : {}),
        });

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
    }

    // A gift keeps a recipient; every other status clears it, mirroring how
    // soldAt / cancelledAt are nulled on exit from their state.
    private async resolveRecipient(
        userId: UserId,
        target: SaleStatusTarget,
        payload: UpdateSaleDto,
    ): Promise<RecipientId | null> {
        if (target !== 'GIFTED') {
            return null;
        }

        if (payload.recipientId != null) {
            return payload.recipientId;
        }

        const name = normalizeRecipientName(payload.recipientName ?? '');

        if (name.length === 0) {
            throw new DomainException(ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED);
        }

        const existing = await this.recipientsDbService.findByNameForUser(userId, name);

        if (existing != null) {
            return existing.id;
        }

        const created = await this.recipientsDbService.create(userId, name);

        return created.id;
    }
```

and, at module scope beneath the class (the codebase already puts pure helpers there, e.g. `src/api/accounting/accounting.service.ts:306`):

```ts
// `status` is the contract; `sold` is the deprecated alias kept for one release
// so the web app and the api can deploy independently.
function resolveTargetStatus(payload: UpdateSaleDto): SaleStatusTarget | undefined {
    if (payload.status !== undefined) {
        return payload.status;
    }

    if (payload.sold === undefined) {
        return undefined;
    }

    return payload.sold ? 'SOLD' : 'PENDING';
}

function normalizeRecipientName(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ');
}
```

- [ ] **Step 6: Take the db layer off the boolean**

`src/db/sales/sales.db.interface.ts` — `updateSale`'s payload drops `sold` and gains `recipientId`:

```ts
    abstract updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        status?: SaleStatus;
        recipientId?: RecipientId | null;
        allocations?: SaleAllocationInput[];
    }): Promise<void>;
```

`src/db/sales/sales.service.ts` — same signature change on the implementation, then replace the status/timestamp block:

```ts
        const nextStatus: SaleStatus = payload.status ?? currentSale.status;

        const wasSold = currentSale.status === SaleStatus.SOLD;
        const willBeSold = nextStatus === SaleStatus.SOLD;
        const wasCancelled = currentSale.status === SaleStatus.CANCELLED;
        const willBeCancelled = nextStatus === SaleStatus.CANCELLED;
        const wasGifted = currentSale.status === SaleStatus.GIFTED;
        const willBeGifted = nextStatus === SaleStatus.GIFTED;

        // soldAt / cancelledAt / giftedAt mirror the current status: set on entry
        // into the state, null on exit. The full transition trail lives in
        // sale_histories, so clearing here loses no audit data.
        const timestampPatch: {
            soldAt?: Date | null;
            cancelledAt?: Date | null;
            giftedAt?: Date | null;
        } = {};

        if (willBeSold && !wasSold) {
            timestampPatch.soldAt = new Date();
        } else if (!willBeSold && wasSold) {
            timestampPatch.soldAt = null;
        }

        if (willBeCancelled && !wasCancelled) {
            timestampPatch.cancelledAt = new Date();
        } else if (!willBeCancelled && wasCancelled) {
            timestampPatch.cancelledAt = null;
        }

        if (willBeGifted && !wasGifted) {
            timestampPatch.giftedAt = new Date();
        } else if (!willBeGifted && wasGifted) {
            timestampPatch.giftedAt = null;
        }
```

In the `tx.sales.update` call, `shake` strips `undefined` but would also strip a deliberate `null`, so the recipient patch is spread conditionally instead:

```ts
            const recipientPatch =
                payload.recipientId !== undefined
                    ? { recipientId: payload.recipientId }
                    : {};

            await tx.sales.update({
                data: {
                    ...shake({
                        profit: payload.profit,
                        invest: payload.invest,
                        listedPrice: payload.listedPrice,
                        status: nextStatus,
                        ...nbTicketsPatch,
                        ...timestampPatch,
                    }),
                    ...recipientPatch,
                },
                where: {
                    id: payload.saleId,
                    userId: payload.userId,
                },
            });
```

`timestampPatch` values can legitimately be `null` too, so move them out of `shake` the same way if `shake` drops them — verify with the "clears the recipient" and existing revert-to-pending tests before moving on.

- [ ] **Step 7: Run the tests**

Run: `npx jest src/api/sales src/db/sales && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/api/sales src/db/sales src/common/exceptions/error-codes.enum.ts
git commit -m "feat(sales): accept explicit status and gift recipient on update"
```

---

### Task B8: expose `giftedAt` and the recipient on sale payloads

**Files:**
- Modify: `src/db/sales/sales.query.ts`
- Test: `src/api/sales/sales.service.spec.ts`

**Interfaces:**
- Produces: every `GET /sales/*` payload carries `giftedAt: Date | null` (already on the row) and `Recipient: { id, name } | null`.

- [ ] **Step 1: Write the failing test**

In `src/api/sales/sales.service.spec.ts`:

```ts
    describe('when a sale was gifted', () => {
        it('keeps the recipient on the formatted sale', async () => {
            salesDb.getSales.mockResolvedValue([
                {
                    ...existingSale,
                    status: 'GIFTED',
                    giftedAt: new Date('2026-03-01T12:00:00Z'),
                    Recipient: { id: 'r1', name: 'Marc' },
                },
            ]);

            const [sale] = await service.getSales(userId);

            expect(sale.Recipient).toEqual({ id: 'r1', name: 'Marc' });
            expect(sale.giftedAt).toEqual(new Date('2026-03-01T12:00:00Z'));
        });
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/api/sales/sales.service.spec.ts -t "keeps the recipient"`
Expected: FAIL — `Recipient` is not part of the `Sale` type.

- [ ] **Step 3: Include the relation in the query**

`src/db/sales/sales.query.ts`:

```ts
export const saleQuery = {
    include: {
        Match: {
            select: {
                date: true,
                Opponent: true,
            },
        },
        Allocations: {
            select: {
                id: true,
                seasonPassId: true,
                nbTickets: true,
            },
        },
        Recipient: {
            select: {
                id: true,
                name: true,
            },
        },
    },
} as const;
```

`Sale` is derived from this query via `Prisma.SalesGetPayload<typeof saleQuery>`, and `formatSale` spreads everything except `Match` / `userId` / `matchId`, so both fields flow through with no further change.

- [ ] **Step 4: Run the tests**

Run: `npx jest src/api/sales src/db/sales`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/sales/sales.query.ts src/api/sales/sales.service.spec.ts
git commit -m "feat(sales): expose gift recipient on sale payloads"
```

---

### Task B9: CSV import accepts `GIFTED`

**Files:**
- Modify: `src/api/sales-import/sales-import.csv.ts:6`
- Test: `src/api/sales-import/sales-import.csv.spec.ts`

**Interfaces:**
- Produces: `SALE_ROW_STATUSES` includes `'GIFTED'`; imported gifts carry `recipientId = null`.

- [ ] **Step 1: Write the failing test**

In `src/api/sales-import/sales-import.csv.spec.ts`:

```ts
    describe('when a row is GIFTED', () => {
        it('parses the status', () => {
            const csv = Buffer.from(
                'date,opponent,listedPrice,nbTickets,status\n2026-03-01,Lyon,120,1,GIFTED\n',
            );

            const result = parseImportCsv(csv);

            expect(result).toMatchObject({
                kind: 'ok',
                rows: [expect.objectContaining({ status: 'GIFTED' })],
            });
        });
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/api/sales-import/sales-import.csv.spec.ts -t "parses the status"`
Expected: FAIL — the row is rejected as an invalid status.

- [ ] **Step 3: Implement**

`src/api/sales-import/sales-import.csv.ts`:

```ts
// GIFTED is importable, but there is no recipient column: imported gifts land
// with recipientId null and the user attaches a recipient from the sale edit
// panel. See docs/specs/2026-09-11-gifted-sale-status-design.md, D10.
export const SALE_ROW_STATUSES = ['PENDING', 'SOLD', 'CANCELLED', 'GIFTED'] as const;
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/api/sales-import`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/sales-import
git commit -m "feat(import): accept GIFTED rows in sales CSV import"
```

---

### Task B10: demo seed covers gifts

**Files:**
- Modify: `scripts/seed-demo.ts`

**Interfaces:**
- Consumes: `prisma.recipients` (B1), `SaleStatus.GIFTED` (B1).

- [ ] **Step 1: Seed a recipient and two gifted sales**

In `scripts/seed-demo.ts`, widen `addSale` (line 72-95) with a recipient parameter:

```ts
async function addSale(params: {
    userId: string;
    matchId: string;
    listedPrice: number;
    invest: number;
    status: SaleStatus;
    soldAt: Date | null;
    recipientId: string | null;
    allocations: { seasonPassId: string; nbTickets: number }[];
}): Promise<void> {
```

and inside its `prisma.sales.create` data object, after `soldAt: params.soldAt,`:

```ts
            recipientId: params.recipientId,
            giftedAt: params.status === SaleStatus.GIFTED ? new Date() : null,
```

Create the recipient just above the `currentPlans` fixture (line ~157):

```ts
    const recipient = await prisma.recipients.create({
        data: { userId, name: 'Marc' },
    });
```

Add two gifted rows to the end of `currentPlans` (line ~169), keeping its existing shape:

```ts
        { listedPrice: 200, status: SaleStatus.GIFTED, soldAgo: null },
        { listedPrice: 180, status: SaleStatus.GIFTED, soldAgo: null },
```

and pass the recipient through at the `addSale` call inside the `currentPlans` loop (line ~182) and at every other `addSale` call site in the file:

```ts
            recipientId: plan.status === SaleStatus.GIFTED ? recipient.id : null,
```

Every call site that never gifts (the previous-season loop) passes `recipientId: null`.

- [ ] **Step 2: Run the seed against a clean local database**

```bash
npm run local:db:down && npm run local:db:up
npx prisma migrate deploy
npm run local:db:seed
```

Expected: seed completes with no error.

- [ ] **Step 3: Verify the gifts landed in the unrealized bucket**

```bash
docker compose exec -T db psql -U postgres -d psg_inventory -c "select status, count(*) from sales group by status;"
```

Expected: a `GIFTED` row with count 2. The loop runs `Math.min(currentMatches.length, currentPlans.length)` times, so if the count is 0 or 1 there were not enough current-season fixtures — move the two gifted entries nearer the front of `currentPlans` and re-run.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-demo.ts
git commit -m "chore(seed): add gifted sales to the demo dataset"
```

---

## Track A — Frontend (`web/` only)

Track A is written against the frozen contract above. Because the api keeps the deprecated
`sold` alias for one release, Track A can be built and merged before Track B is deployed
without breaking the running app — only the new gift affordance needs the new backend.

### Task A1: types and the gift color token

**Files:**
- Modify: `web/src/lib/types.ts:56-95,142`
- Modify: `web/src/lib/types/sales-import.ts:6`
- Modify: `web/src/app.css`

**Interfaces:**
- Produces: `SaleStatus` including `'GIFTED'`; `SaleRecipient`, `RecipientListItem`; `giftedAt` / `Recipient` on `SaleListItem` and `SaleDetail`; `gifted` on the accounting type; `text-gift` / `bg-gift` / `text-gift-strong` utilities.

- [ ] **Step 1: Extend the types**

`web/src/lib/types.ts`:

```ts
export type SaleStatus = 'PENDING' | 'SOLD' | 'CANCELLED' | 'GIFTED';

export type SaleRecipient = {
    id: string;
    name: string;
};

export type RecipientListItem = {
    id: string;
    name: string;
    giftCount: number;
};
```

Add to both `SaleListItem` and `SaleDetail`, next to `cancelledAt`:

```ts
    giftedAt?: string | null;
    Recipient?: SaleRecipient | null;
```

At line 142, inside the time-period accounting type, next to `unrealized`:

```ts
    // Subset of `unrealized` — render as a breakdown line, never as its own total.
    gifted: Accounting | null;
```

`web/src/lib/types/sales-import.ts`:

```ts
export type SaleStatus = 'PENDING' | 'SOLD' | 'CANCELLED' | 'GIFTED';
```

- [ ] **Step 2: Add the color token**

`web/src/app.css`, in the light block next to `--color-sunk`:

```css
    /* gift: tickets given away rather than sold. Not a loss (sunk), not
       in-flight (warning), not cash (positive) — its own hue at 210. */
    --color-gift: oklch(0.5 0.1 210);
    --color-gift-strong: oklch(0.43 0.11 210);
```

and in the dark block next to the dark `--color-sunk`:

```css
    --color-gift: oklch(0.74 0.11 210);
    --color-gift-strong: oklch(0.82 0.12 210);
```

- [ ] **Step 3: Verify contrast in both themes**

Compute the contrast ratio of `--color-gift` against `--color-surface` for each theme (light surface `oklch(0.995 0.003 270)`, dark surface `oklch(0.18 0.01 270)`). Both must be ≥ 4.5:1; lower the light lightness / raise the dark lightness until they are. Record the two measured ratios in the commit message.

- [ ] **Step 4: Verify the app still type-checks and builds**

```bash
cd web && npm run check && npm run build
```

Expected: no errors. `svelte-check` will flag the not-yet-handled `'GIFTED'` arms in
`statusPill` / `profitTone` — that is expected here and fixed in A2/A3. If `check` fails only
with those two exhaustiveness errors, proceed.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/types/sales-import.ts web/src/app.css
git commit -m "feat(web): add GIFTED status type and gift color token"
```

---

### Task A2: gift affordance on the sales screen

**Files:**
- Modify: `web/src/routes/(app)/sales/+page.server.ts:9-56,58-102`
- Modify: `web/src/routes/(app)/sales/+page.svelte:121-153,439-526`

**Interfaces:**
- Consumes: `GET /recipients` → `RecipientListItem[]`; `POST /sales/update` with `status` / `recipientName`.
- Produces: page data gains `recipients: RecipientListItem[]`.

- [ ] **Step 1: Load recipients and send the new fields**

In `web/src/routes/(app)/sales/+page.server.ts`, load recipients alongside passes:

```ts
    const recipients = await api<RecipientListItem[]>(event, '/recipients');
```

and add `recipients` to the returned object.

In `readPayload`, replace the `sold` boolean with the explicit status and carry the recipient:

```ts
function readPayload(form: FormData): {
    payload?: Record<string, unknown>;
    error?: string;
} {
    const saleId = form.get('saleId');

    if (typeof saleId !== 'string' || saleId.length === 0) {
        return { error: 'Missing sale id.' };
    }

    const statusRaw = form.get('status');
    const payload: Record<string, unknown> = { saleId };

    if (
        statusRaw === 'PENDING' ||
        statusRaw === 'SOLD' ||
        statusRaw === 'GIFTED'
    ) {
        payload.status = statusRaw;
    }

    if (statusRaw === 'GIFTED') {
        const recipientName = form.get('recipientName');

        if (typeof recipientName !== 'string' || recipientName.trim().length === 0) {
            return { error: 'Gift recipient is required.' };
        }

        payload.recipientName = recipientName.trim();
    }
    …
```

The rest of `readPayload` (allocations, listedPrice, invest) is unchanged.

- [ ] **Step 2: Handle the new status in the pill and tone helpers**

`web/src/routes/(app)/sales/+page.svelte`:

```ts
    function statusPill(status: SaleStatus): string {
        switch (status) {
            case 'SOLD':
                return 'bg-positive/15 text-positive-strong';
            case 'PENDING':
                return 'bg-warning/15 text-warning-strong';
            case 'CANCELLED':
                return 'bg-sunk/15 text-sunk-strong';
            case 'GIFTED':
                return 'bg-gift/15 text-gift-strong';
        }
    }

    function profitTone(status: SaleStatus, profit: number): string {
        if (status === 'CANCELLED') {
            return 'text-sunk';
        }

        if (status === 'GIFTED') {
            return 'text-gift';
        }

        if (status === 'PENDING') {
            return 'text-warning';
        }

        if (profit < 0) {
            return 'text-negative';
        }

        if (profit > 0) {
            return 'text-positive';
        }

        return 'text-ink';
    }
```

Import `SaleStatus` from `$lib/types` and use it in place of the three inline unions at lines 121 and 133.

- [ ] **Step 3: Replace the hidden `sold` inputs with `status`**

Three places in the edit panel:
- the revert form (line ~463): `<input type="hidden" name="status" value="PENDING" />`
- the mark-sold form (line ~485): `<input type="hidden" name="status" value="SOLD" />`
- the numbers form (line ~522-526), which must preserve the current status rather than flip it:

```svelte
                <input type="hidden" name="status" value={editSale.status} />
```

`editSale.status` can be `CANCELLED`, which the api rejects as a target — so guard it:

```svelte
                {#if editSale.status !== 'CANCELLED'}
                    <input type="hidden" name="status" value={editSale.status} />
                {/if}
```

Omitting `status` leaves the sale's status untouched, which is exactly what the numbers form
wants for a cancelled sale.

- [ ] **Step 4: Add the gift block with the recipient combobox**

Inside the status commit block, after the mark-sold form and before the closing `</div>` at line ~510, add a sibling form. It renders whenever the sale is not already `GIFTED`:

```svelte
                {#if editSale.status !== 'GIFTED'}
                    <form
                        method="POST"
                        action="?/update"
                        class="space-y-2 border-t border-line pt-2"
                        use:enhance={trackFlip}
                    >
                        <input type="hidden" name="saleId" value={editSale.id} />
                        <input type="hidden" name="status" value="GIFTED" />

                        <label class="block">
                            <span class="text-xs text-ink-muted">Given to</span>
                            <input
                                type="text"
                                name="recipientName"
                                list="recipient-options"
                                required
                                autocomplete="off"
                                maxlength="120"
                                placeholder="Name"
                                class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={submitting !== null}
                            class="w-full rounded border border-gift text-gift-strong px-4 py-2 font-medium hover:bg-gift/10 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors"
                        >
                            {#if submitting === 'flip'}
                                <Spinner size="1em" />
                            {/if}
                            Mark gifted
                        </button>
                        <p class="text-xs text-ink-faint">
                            Records this ticket as given away. Stays out of realized profit.
                        </p>
                        <p class="text-xs text-ink-faint">
                            Who received it? Type a new name to add them.
                        </p>
                    </form>
                {:else}
                    <p class="text-sm text-ink">
                        <span class="font-medium text-gift-strong">Gifted</span>
                        <span class="text-ink-muted">·</span>
                        <span class="text-ink-muted">Given to</span>
                        <span class="text-ink">{editSale.Recipient?.name ?? '—'}</span>
                    </p>
                {/if}
```

and, once per page (place it immediately after the `editPanel` snippet's root `<div>` opening tag so it is in the DOM whenever the panel is):

```svelte
            <datalist id="recipient-options">
                {#each data.recipients as recipient (recipient.id)}
                    <option value={recipient.name}></option>
                {/each}
            </datalist>
```

The list is ordered most-gifted-first by the api, and typing a name that is not in the list creates that recipient on submit.

- [ ] **Step 5: Verify**

```bash
cd web && npm run check && npm run build
```

Expected: no errors, including no remaining exhaustiveness errors on `statusPill` / `profitTone` in this file.

- [ ] **Step 6: Commit**

```bash
git add "web/src/routes/(app)/sales/+page.server.ts" "web/src/routes/(app)/sales/+page.svelte"
git commit -m "feat(web): mark a sale gifted with a recipient"
```

---

### Task A3: sale detail screen

**Files:**
- Modify: `web/src/routes/(app)/sales/[saleId]/+page.svelte:13-34,87-99,177-185`
- Modify: `web/src/routes/(app)/sales/[saleId]/+page.server.ts:18-52`

**Interfaces:**
- Consumes: the same contract as A2.

- [ ] **Step 1: Send `status` instead of `sold`**

`web/src/routes/(app)/sales/[saleId]/+page.server.ts`, in the `update` action:

```ts
        const statusRaw = form.get('status');
        const payload: Record<string, unknown> = { saleId };

        if (statusRaw === 'PENDING' || statusRaw === 'SOLD' || statusRaw === 'GIFTED') {
            payload.status = statusRaw;
        }
```

- [ ] **Step 2: Handle `GIFTED` in the tone helper**

```ts
    function profitTone(status: SaleStatus, profit: number): string {
        if (status === 'CANCELLED') {
            return 'text-sunk';
        }

        if (status === 'GIFTED') {
            return 'text-gift';
        }

        if (status === 'PENDING') {
            return 'text-warning';
        }

        if (profit < 0) {
            return 'text-negative';
        }

        if (profit > 0) {
            return 'text-positive';
        }

        return 'text-ink';
    }
```

Import `SaleStatus` from `$lib/types`.

- [ ] **Step 3: Show the recipient in the summary grid**

After the Profit row (line ~98), inside the same grid:

```svelte
    {#if sale.status === 'GIFTED'}
        <span class="text-ink-muted">Recipient</span>
        <span class="text-ink">{sale.Recipient?.name ?? '—'}</span>
    {/if}
```

- [ ] **Step 4: Replace the "Mark as sold" checkbox**

The checkbox at lines 177-185 cannot express three states. Replace it with a select whose name is `status`:

```svelte
    <label class="block">
        <span class="text-sm text-ink-muted">Status</span>
        <select
            name="status"
            value={sale.status === 'CANCELLED' ? 'PENDING' : sale.status}
            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
        >
            <option value="PENDING">PENDING</option>
            <option value="SOLD">SOLD</option>
            <option value="GIFTED">GIFTED</option>
        </select>
    </label>
```

This screen does not offer recipient entry: a `GIFTED` selection here without a recipient is
rejected by the api and surfaces through the existing `form?.message` alert, which points the
user at the sales screen's gift block. Keep it that way — the combobox lives in one place.

- [ ] **Step 5: Verify**

```bash
cd web && npm run check && npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "web/src/routes/(app)/sales/[saleId]"
git commit -m "feat(web): show gift status and recipient on sale detail"
```

---

### Task A4: import draft offers `GIFTED`

**Files:**
- Modify: `web/src/lib/ui/ImportSalesDraft.svelte:303-307`

- [ ] **Step 1: Add the option**

```svelte
                                    <option>PENDING</option>
                                    <option>SOLD</option>
                                    <option>CANCELLED</option>
                                    <option>GIFTED</option>
```

The adjacent `soldAt` date input stays `disabled={row.status !== 'SOLD'}` — imported gifts
carry no date and no recipient by design.

- [ ] **Step 2: Verify**

```bash
cd web && npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/ui/ImportSalesDraft.svelte
git commit -m "feat(web): offer GIFTED in the import draft grid"
```

---

### Task A5: "of which gifted" under Unrealized

**Files:**
- Modify: `web/src/lib/ui/AccountingCard.svelte:6-22`
- Modify: `web/src/routes/(app)/accounting/+page.svelte:194-197`
- Modify: `web/src/routes/(app)/dashboard/+page.svelte:161-178`

**Interfaces:**
- Consumes: `accounting.gifted` from A1's type change.
- Produces: `AccountingCard` accepts an optional `footnote?: string`.

- [ ] **Step 1: Add the footnote prop**

`web/src/lib/ui/AccountingCard.svelte`:

```ts
    let {
        title,
        data,
        subtitle,
        footnote,
        showSeason = false,
        showDate = false,
        variant = 'full',
        tone = 'neutral',
    }: {
        title: string;
        data: Accounting | null;
        subtitle?: string;
        footnote?: string;
        showSeason?: boolean;
        showDate?: boolean;
        variant?: 'full' | 'compact';
        tone?: 'neutral' | 'warning' | 'sunk';
    } = $props();
```

Render it as the last child of both the compact and full `<section>` bodies:

```svelte
    {#if footnote}
        <p class="mt-2 text-xs text-gift">{footnote}</p>
    {/if}
```

- [ ] **Step 2: Pass the gift breakdown from the accounting page**

`web/src/routes/(app)/accounting/+page.svelte`, on the Unrealized card:

```svelte
            footnote={accounting.gifted
                ? `of which gifted ${money(accounting.gifted.totalProfit)}`
                : undefined}
```

`money` is already imported in this file; if not, import it from `$lib/format`.

- [ ] **Step 3: Pass it from the dashboard too**

Same prop on the dashboard's Unrealized card (line ~175). The plain-text `<dt>Unrealized</dt>` block at line 161 is the no-JS/skeleton fallback and needs no change.

- [ ] **Step 4: Verify**

```bash
cd web && npm run check && npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/ui/AccountingCard.svelte "web/src/routes/(app)/accounting/+page.svelte" "web/src/routes/(app)/dashboard/+page.svelte"
git commit -m "feat(web): break out gifted share of unrealized profit"
```

---

## Track C — Post-deploy cleanup (do not run before both tracks are in production)

### Task C1: drop the deprecated `sold` alias

**Files:**
- Modify: `src/api/sales/dto/update-sale.dto.ts`
- Modify: `src/api/sales/sales.service.ts` (`resolveTargetStatus`)
- Test: `src/api/sales/sales.service.spec.ts`

- [ ] **Step 1: Confirm no caller still sends it**

```bash
grep -rn "name=\"sold\"\|payload.sold\|sold:" web/src src --include="*.ts" --include="*.svelte" | grep -v spec
```

Expected: no hits outside the DTO and `resolveTargetStatus`.

- [ ] **Step 2: Delete the field and its branch**

Remove `sold?: boolean` and its decorators from `UpdateSaleDto`. `resolveTargetStatus` collapses to:

```ts
function resolveTargetStatus(payload: UpdateSaleDto): SaleStatusTarget | undefined {
    return payload.status;
}
```

Inline it at the one call site and delete the function.

- [ ] **Step 3: Delete the two alias tests**

Remove the `when only the deprecated sold flag is sent` and `when both status and the deprecated sold flag are sent` describes from `src/api/sales/sales.service.spec.ts`.

- [ ] **Step 4: Run the suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/sales
git commit -m "refactor(sales): drop the deprecated sold flag"
```

---

## Final verification (after Track A and Track B)

- [ ] `npm test` — full backend suite passes.
- [ ] `npm run typecheck && npm run lint && npm run lint:deps` — clean.
- [ ] `cd web && npm run check && npm run build` — clean.
- [ ] Manual pass against the local stack (`npm run local:db:up`, `npm run start:dev`, `cd web && npm run dev`):
  - Mark a pending sale gifted with a brand-new name → the sale shows the `GIFTED` pill, the name appears on the detail screen, and the name is offered in the combobox on the next gift.
  - Mark a second sale gifted with the same name in different casing → no duplicate appears in the combobox.
  - Mark a **past-kickoff** cancelled sale gifted → accepted (no `SALE_AFTER_KICKOFF`).
  - Try to mark a past-kickoff sale sold → still rejected.
  - Accounting page: `Unrealized` total is unchanged by the gift compared with the same sale cancelled, and the `of which gifted` line matches the gifted amount.
  - Revert a gifted sale to pending → the recipient and the gifted timestamp are cleared, and the recipient stays in the combobox.
