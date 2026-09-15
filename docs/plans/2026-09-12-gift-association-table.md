# Gift Association Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move giftedness off `sales.recipient_id` / `sales.gifted_at` and into a `gifts` association row, so that "a sale is gifted ⟺ it has a gift row" is enforced by the database instead of by discipline — without changing a single byte of the API response or a single file under `web/`.

**Architecture:** A new `gifts` table holds `sale_id` (unique), `recipient_id` (nullable), `gifted_at` (nullable) and a constant `sale_status` column that exists only to carry a composite foreign key `(sale_id, sale_status) → sales(id, status)` with `ON UPDATE RESTRICT` and a `CHECK (sale_status = 'GIFTED')`. That pair of constraints makes it physically impossible to attach a gift to a non-gifted sale, or to change a gifted sale's status while its gift row exists. Above the database, `ISalesDbService.updateSale` narrows its status parameter to `'PENDING' | 'SOLD'` so the generic update path cannot even *type* a transition into `GIFTED`; three purpose-built methods (`giftSale`, `updateGift`, `ungiftSale`) own giftedness and each performs both of its writes inside one `$transaction`. The api layer flattens the joined gift back into `giftedAt` + `Recipient` on the way out, keeping the wire contract byte-identical.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (`src/`), Jest + `jest-mock-extended` for backend unit tests, docker-compose Postgres for the constraint verification (`npm run local:db:up`). No frontend work — SvelteKit app untouched.

## Global Constraints

- **Spec of record:** `docs/specs/2026-09-11-gifted-sale-status-design.md`, decisions **D14–D19** (added 2026-09-12, second revision round). Read D14, D15 and D17 before starting. D1–D13 describe behaviour that this plan must preserve unchanged, not reimplement.
- **This feature is unreleased.** `origin/main` has none of it. Migrations may be edited in place (D19); no backfill, no drop-column step, no third migration.
- **Zero frontend changes.** If a task appears to require editing anything under `web/`, stop and escalate — it means the flattening in Task 3 is wrong (D17).
- **Zero accounting changes.** Accounting buckets on `sales.status`, which is untouched (D18). Do not add a join to `src/db/accounting/*`.
- Hexagonal split is mandatory: `src/api/**/*.service.ts` must never import Prisma or any ORM. Only `src/db/**` and `scripts/**` import Prisma.
- Explicit return types on every backend function and method, including `Promise<void>`.
- No single-letter locals (classic indexed-`for` `i`/`j`/`k` excepted). No inline `if` — always braced, body on its own line. Blank line before `if` / `for` / `while` / `return` / `throw` unless it is the first statement in its block.
- Constructor-injected dependencies are `private readonly`.
- Jest structure: a `describe` per condition (`when …`), `it` titles state only the outcome, shared setup in that `describe`'s own `beforeEach`.
- Deps are exact-pinned; this plan adds no dependencies.
- `npm run lint -- --max-warnings 0`, `npm run typecheck` and `npm test` must all pass at the end of every task. Run `npm run format` before staging.
- **Do not commit.** Per this project's workflow, each task ends by *staging* its changes and reporting. The user runs `/crit` on the staged diff and gives the go-ahead before anything is committed. The `git add` lines below are deliberate; there are no `git commit` lines.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `scripts/ungift-sale.ts` | Operator entry point for the sanctioned manual un-gift (spec D16) |
| `scripts/verify-gift-constraints.sql` | Scripted psql proof that the database enforces the invariant (spec D15, Testing) |

**Renamed + rewritten:**

| File | Responsibility after this change |
|---|---|
| `src/prisma/migrations/20260911120100_add_recipients/migration.sql` → `.../20260911120100_add_recipients_and_gifts/migration.sql` | Creates `recipients` and `gifts`. Adds no column to `sales` |

**Modified:**

| File | Responsibility after this change |
|---|---|
| `src/prisma/schema.prisma` | `Gifts` model; `Sales.Gift` + `@@unique([id, status])`; `Sales` loses `recipientId` / `giftedAt` / `Recipient`; `Recipients.Gifts` replaces `Recipients.Sales` |
| `src/db/sales/sales.query.ts` | Joins `Gift` (and its `Recipient`) instead of the sale's own `Recipient` |
| `src/db/sales/type/sale.type.ts` | `Gift` branded override; no `recipientId` / `Recipient` |
| `src/db/sales/sales.db.interface.ts` | `updateSale.status` narrowed to `'PENDING' \| 'SOLD'`; `giftSale`, `updateGift`, `ungiftSale` added |
| `src/db/sales/sales.service.ts` | The three gift methods, each one `$transaction`; shared private write helper; `deleteSale` drops the gift row |
| `src/db/sales/sales.service.spec.ts` | Covers the three methods and the atomicity of each |
| `src/api/sales/sales.service.ts` | Routes a write to `giftSale` / `updateGift` / `updateSale`; flattens `Gift` on read; `ungiftSale` orchestration |
| `src/api/sales/interfaces/sales.service.interface.ts` | `SaleResponse` (flattened) and `FormattedSale` built from it |
| `src/api/sales/sales.service.spec.ts` | Routing + flattening cases on top of the existing guard cases |
| `src/db/recipients/recipients.service.ts` | `giftCount` is an unfiltered `_count` on `Gifts` |
| `src/db/recipients/recipients.service.spec.ts` | `_count: { Gifts: n }` fixtures |
| `src/db/sales-import/sales-import.service.ts` | `bulkCreate` writes the gift row; `deleteBatch` removes gift rows |
| `src/db/sales-import/sales-import.service.spec.ts` | A committed `GIFTED` row produces a gift row |
| `src/redis/CACHE_KEYS.ts` | `sale` / `sales` / `salesByRange` get `:v2` |
| `scripts/seed-demo.ts` | Seeds gifts as rows |

**Deliberately untouched:** everything under `web/`, `src/api/accounting/**`, `src/db/accounting/**`, `src/api/recipients/**`, `src/api/sales/dto/update-sale.dto.ts`, `src/api/sales-import/**`, `src/api/ask/**`, `src/common/exceptions/**`.

---

### Task 1: Schema and migration — the constraints that make the invariant real

**Files:**
- Modify: `src/prisma/schema.prisma`
- Rename + rewrite: `src/prisma/migrations/20260911120100_add_recipients/migration.sql` → `src/prisma/migrations/20260911120100_add_recipients_and_gifts/migration.sql`
- Create: `scripts/verify-gift-constraints.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: the Prisma client types `Gifts`, `Sales.Gift`, `Recipients.Gifts`; the table `gifts` with columns `id`, `sale_id`, `sale_status`, `recipient_id`, `gifted_at`, `created_at`, `updated_at`. `Sales` no longer has `recipientId` or `giftedAt` — every later task depends on that removal.

> **Read first:** spec D14 (the model), D15 (why `sale_status` exists — do not delete it), D19 (why this migration is edited rather than added).

- [ ] **Step 1: Start the local database**

```bash
npm run local:db:up
```

Expected: `psg-inventory-db` reports healthy within ~10s (`docker ps` shows `(healthy)`).

- [ ] **Step 2: Edit `src/prisma/schema.prisma` — `Recipients`**

Replace the `Sales Sales[]` back-relation with `Gifts Gifts[]`:

```prisma
model Recipients {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  name      String
  User      Users    @relation(fields: [userId], references: [id])
  Gifts     Gifts[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt() @map("updated_at")

  @@unique([userId, name])
  @@map("recipients")
}
```

- [ ] **Step 3: Add the `Gifts` model directly below `Recipients`**

```prisma
// A sale is gifted if and only if it has a row here. `saleStatus` is not data:
// it is always 'GIFTED' (pinned by a CHECK constraint the migration adds by
// hand) and exists solely so the foreign key below can be composite. That
// composite key is what makes the database refuse to attach a gift to a
// non-gifted sale, and refuse to change a gifted sale's status while the gift
// row still exists. Deleting the column deletes the guarantee — see
// docs/specs/2026-09-11-gifted-sale-status-design.md D14/D15.
model Gifts {
  id          String      @id @default(uuid())
  saleId      String      @unique @map("sale_id")
  saleStatus  SaleStatus  @default(GIFTED) @map("sale_status")
  recipientId String?     @map("recipient_id")
  giftedAt    DateTime?   @map("gifted_at")
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt() @map("updated_at")
  Sale        Sales       @relation(fields: [saleId, saleStatus], references: [id, status], onDelete: Cascade, onUpdate: Restrict)
  Recipient   Recipients? @relation(fields: [recipientId], references: [id], onDelete: SetNull)

  @@unique([saleId, saleStatus])
  @@index([recipientId])
  @@map("gifts")
}
```

- [ ] **Step 4: Edit the `Sales` model — remove the denormalized columns, add the gift relation**

```prisma
model Sales {
  id          String          @id @default(uuid())
  userId      String          @map("user_id")
  matchId     String          @map("match_id")
  listedPrice Int             @map("listed_price")
  profit      Float
  invest      Int             @default(0)
  nbTickets   Int             @map("nb_tickets")
  status      SaleStatus
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")
  soldAt      DateTime?       @map("sold_at")
  cancelledAt DateTime?       @map("cancelled_at")
  importBatchId String?       @map("import_batch_id")
  SaleHistory SaleHistories[]
  Allocations SalePassAllocations[]
  Match       Matches         @relation(fields: [matchId], references: [id])
  User        Users           @relation(fields: [userId], references: [id])
  Gift        Gifts?

  // The composite target of the gifts foreign key. `id` alone is already the
  // primary key; this pair lets a gift row pin the sale's status (D15).
  @@unique([id, status])
  @@index([userId, importBatchId])
  @@map("sales")
}
```

`giftedAt`, `recipientId`, the `Recipient` relation and `@@index([recipientId])` are all deleted.

- [ ] **Step 5: Validate the schema — this is the spike gate**

Run: `npx prisma validate`
Expected: `The schema at src/prisma/schema.prisma is valid 🚀`

**If it fails**, the fallback is defined and does not need escalation: keep `saleStatus` as a *plain scalar field* (delete it from the `@relation(fields: …)` list and delete `@@unique([saleId, saleStatus])`), declare the relation over `saleId` alone — `Sale Sales @relation(fields: [saleId], references: [id], onDelete: Cascade)` — and add the composite foreign key by hand in Step 7's SQL alongside the CHECK. The column must stay in the Prisma model either way, or `prisma migrate` will see drift and try to drop it. Record which variant you used in the task report.

- [ ] **Step 6: Rename the migration directory**

```bash
git mv src/prisma/migrations/20260911120100_add_recipients src/prisma/migrations/20260911120100_add_recipients_and_gifts
```

- [ ] **Step 7: Rewrite `src/prisma/migrations/20260911120100_add_recipients_and_gifts/migration.sql`**

Replace the whole file with:

```sql
CREATE TABLE "recipients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipients_user_id_name_key" ON "recipients"("user_id", "name");

ALTER TABLE "recipients" ADD CONSTRAINT "recipients_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite target of the gifts foreign key below. `id` is already the
-- primary key; this pair is what lets a gift row pin the sale's status.
CREATE UNIQUE INDEX "sales_id_status_key" ON "sales"("id", "status");

CREATE TABLE "gifts" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "sale_status" "SaleStatus" NOT NULL DEFAULT 'GIFTED',
    "recipient_id" TEXT,
    "gifted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gifts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gifts_sale_id_key" ON "gifts"("sale_id");
CREATE UNIQUE INDEX "gifts_sale_id_sale_status_key" ON "gifts"("sale_id", "sale_status");
CREATE INDEX "gifts_recipient_id_idx" ON "gifts"("recipient_id");

-- sale_status is a constant, not data. Together with the composite foreign key
-- it gives the biconditional "a gifts row exists <=> sales.status = 'GIFTED'"
-- teeth: no gift row can attach to a non-gifted sale, and no gifted sale can
-- change status while its gift row lives. See spec D15.
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_sale_status_check"
    CHECK ("sale_status" = 'GIFTED');

ALTER TABLE "gifts" ADD CONSTRAINT "gifts_sale_id_sale_status_fkey"
    FOREIGN KEY ("sale_id", "sale_status") REFERENCES "sales"("id", "status")
    ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "gifts" ADD CONSTRAINT "gifts_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
```

The file must add **no** column to `sales`. `20260911120000_add_gifted_sale_status/migration.sql` is not touched.

- [ ] **Step 8: Reset and re-apply the local database**

```bash
npx prisma migrate reset --force --schema src/prisma/schema.prisma
```

Expected: both migrations apply cleanly, ending with `Database reset successful`. If Prisma reports that the migration's checksum changed, that is expected — `reset` is what resolves it (D19).

- [ ] **Step 9: Verify Prisma's own diff is empty**

Run: `npx prisma migrate diff --from-migrations src/prisma/migrations --to-schema-datamodel src/prisma/schema.prisma --shadow-database-url "postgresql://postgres:postgres@localhost:5432/psg_shadow" --exit-code`
Expected: exit code 0 and `No difference detected`. A non-empty diff means the hand-written SQL and the schema disagree — reconcile before continuing. (The hand-added `CHECK` is invisible to this diff; that is expected and fine.)

- [ ] **Step 10: Write the constraint proof — `scripts/verify-gift-constraints.sql`**

```sql
-- Proves the database itself enforces "a gifts row exists <=> sales.status =
-- 'GIFTED'" (spec D15). Run against the local dev database:
--   docker exec -i psg-inventory-db psql -U postgres -d psg_inventory \
--     -v ON_ERROR_STOP=0 -f - < scripts/verify-gift-constraints.sql
-- Every statement labelled EXPECT FAIL must print an ERROR; every statement
-- labelled EXPECT OK must succeed.
BEGIN;

INSERT INTO users (id, first_name, last_name, email, password, created_at, updated_at, role)
VALUES ('cu-1', 'C', 'U', 'constraints@psg.fr', 'x', now(), now(), 'USER');

INSERT INTO opponents (id, name) VALUES ('co-1', 'Constraint FC');

INSERT INTO matches (id, opponent_id, at_home, date, competition)
VALUES ('cm-1', 'co-1', true, now() + interval '7 days', 'CHAMPIONSHIP');

INSERT INTO sales (id, user_id, match_id, listed_price, profit, invest, nb_tickets, status, created_at, updated_at)
VALUES ('cs-1', 'cu-1', 'cm-1', 100, 90, 0, 1, 'PENDING', now(), now());

-- EXPECT FAIL: a gift cannot attach to a PENDING sale.
INSERT INTO gifts (id, sale_id, sale_status, gifted_at, created_at, updated_at)
VALUES ('cg-1', 'cs-1', 'GIFTED', now(), now(), now());

-- EXPECT FAIL: sale_status is pinned to GIFTED.
INSERT INTO gifts (id, sale_id, sale_status, gifted_at, created_at, updated_at)
VALUES ('cg-1', 'cs-1', 'PENDING', now(), now(), now());

-- EXPECT OK: status first, then the gift row.
UPDATE sales SET status = 'GIFTED' WHERE id = 'cs-1';
INSERT INTO gifts (id, sale_id, sale_status, gifted_at, created_at, updated_at)
VALUES ('cg-1', 'cs-1', 'GIFTED', now(), now(), now());

-- EXPECT FAIL: this is the bug the whole redesign exists to make impossible.
UPDATE sales SET status = 'PENDING' WHERE id = 'cs-1';

-- EXPECT OK: editing anything other than the status still works on a gift.
UPDATE sales SET listed_price = 123 WHERE id = 'cs-1';

-- EXPECT OK: re-writing the same status is not a key change (recipient updates).
UPDATE sales SET status = 'GIFTED' WHERE id = 'cs-1';

-- EXPECT OK: the sanctioned repair, in the only order the database allows.
DELETE FROM gifts WHERE sale_id = 'cs-1';
UPDATE sales SET status = 'PENDING' WHERE id = 'cs-1';

ROLLBACK;
```

- [ ] **Step 11: Run the constraint proof**

```bash
docker exec -i psg-inventory-db psql -U postgres -d psg_inventory -v ON_ERROR_STOP=0 -f - < scripts/verify-gift-constraints.sql
```

Expected output, in order: two `ERROR:` lines (foreign key violation, then check constraint violation), then `UPDATE 1` / `INSERT 0 1`, then one `ERROR:` (foreign key violation on the status change), then `UPDATE 1`, `UPDATE 1`, `DELETE 1`, `UPDATE 1`.

**Three errors, in those three places, and nowhere else.** If the `UPDATE sales SET status = 'PENDING'` on a gifted sale *succeeds*, the composite foreign key is not doing its job — stop and escalate; nothing else in this plan is worth building on top of a broken constraint.

- [ ] **Step 12: Regenerate the client and stage**

```bash
npx prisma generate
npm run format
git add src/prisma/schema.prisma src/prisma/migrations scripts/verify-gift-constraints.sql
```

Note: `npm run typecheck` will now fail loudly across `src/db/sales/**`, `src/db/recipients/**`, `src/db/sales-import/**` and `scripts/seed-demo.ts`, because `sales.recipientId` and `sales.giftedAt` no longer exist. That is the expected state at the end of this task; Tasks 2–7 clear it. Report the failing file list in the task report.

---

### Task 2: The read shape — join the gift, flatten it, keep the wire contract

**Files:**
- Modify: `src/db/sales/sales.query.ts`
- Modify: `src/db/sales/type/sale.type.ts`
- Modify: `src/api/sales/interfaces/sales.service.interface.ts`
- Modify: `src/api/sales/sales.service.ts` (read paths only — `getSale`, `formatSale`)
- Modify: `src/redis/CACHE_KEYS.ts`
- Test: `src/api/sales/sales.service.spec.ts`

**Interfaces:**
- Consumes: the `Gifts` model and `Sales.Gift` relation from Task 1.
- Produces: `Sale['Gift']` typed as `{ giftedAt: Date | null; recipientId: RecipientId | null; Recipient: { id: RecipientId; name: string } | null } | null`, and the exported api type `SaleResponse = Omit<Sale, 'Gift'> & { giftedAt: Date | null; Recipient: { id: RecipientId; name: string } | null }`. Task 4 depends on both names.

> **Read first:** spec D17. This task is the reason the frontend needs no changes; if the output shape drifts, `web/` breaks silently.

- [ ] **Step 1: Write the failing tests in `src/api/sales/sales.service.spec.ts`**

Add a new top-level `describe` (the file's existing `saleFixture` helper gains a `Gift` field in Step 4; write the tests against the final shape first):

```ts
describe('reading a sale', () => {
    describe('when the sale has a gift', () => {
        it('serves giftedAt and Recipient flattened onto the sale', async () => {
            const giftedAt = new Date('2026-03-01T12:00:00.000Z');

            salesDbService.getOneSale.mockResolvedValueOnce({
                ...saleFixture(new Date('2026-03-02T20:00:00.000Z'), SaleStatus.GIFTED),
                Gift: {
                    giftedAt,
                    recipientId: 'r1' as RecipientId,
                    Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                },
            } as unknown as Sale);

            const result = await service.getSale(userId, saleId);

            expect(result.giftedAt).toEqual(giftedAt);
            expect(result.Recipient).toEqual({ id: 'r1', name: 'Marc' });
            expect('Gift' in result).toBe(false);
        });
    });

    describe('when the sale has no gift', () => {
        it('serves null for both fields', async () => {
            salesDbService.getOneSale.mockResolvedValueOnce({
                ...saleFixture(new Date('2026-03-02T20:00:00.000Z')),
                Gift: null,
            } as unknown as Sale);

            const result = await service.getSale(userId, saleId);

            expect(result.giftedAt).toBeNull();
            expect(result.Recipient).toBeNull();
        });
    });

    describe('when listing sales', () => {
        it('flattens the gift on every row', async () => {
            salesDbService.getSales.mockResolvedValueOnce([
                {
                    ...saleFixture(new Date('2026-03-02T20:00:00.000Z'), SaleStatus.GIFTED),
                    Gift: {
                        giftedAt: new Date('2026-03-01T12:00:00.000Z'),
                        recipientId: 'r1' as RecipientId,
                        Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                    },
                } as unknown as Sale,
            ]);

            const [sale] = await service.getSales(userId);

            expect(sale.Recipient).toEqual({ id: 'r1', name: 'Marc' });
            expect('Gift' in sale).toBe(false);
        });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/api/sales/sales.service.spec.ts -t "reading a sale"`
Expected: FAIL — `result.giftedAt` is `undefined` (the service returns the db row untouched).

- [ ] **Step 3: Join the gift in `src/db/sales/sales.query.ts`**

```ts
// Prisma query shape used by sales.service.ts and referenced by
// sale.type.ts to derive `Sale = Prisma.SalesGetPayload<typeof saleQuery>`.
// Lives in its own file so the type doesn't have to import the service
// (which would close a service ↔ type cycle).
// `Gift` is the sale's giftedness in full: its existence means gifted, its
// `giftedAt` is when, its `Recipient` is to whom. The api layer flattens it
// back onto the sale before it goes out on the wire (spec D17).
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
        Gift: {
            select: {
                giftedAt: true,
                recipientId: true,
                Recipient: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        },
    },
} as const;
```

- [ ] **Step 4: Rebrand the type in `src/db/sales/type/sale.type.ts`**

Replace the `recipientId` and `Recipient` entries in the `Override` block with:

```ts
        Gift: Override<
            NonNullable<SaleRow['Gift']>,
            {
                recipientId: RecipientId | null;
                Recipient: Override<
                    NonNullable<NonNullable<SaleRow['Gift']>['Recipient']>,
                    { id: RecipientId }
                > | null;
            }
        > | null;
```

Keep the `RecipientId` import; everything else in the file is unchanged.

- [ ] **Step 5: Declare the flattened response type in `src/api/sales/interfaces/sales.service.interface.ts`**

```ts
import type { OpponentId, RecipientId, SaleId, UserId } from '@psg/shared/ids';
import type { ListedPrice, Profit } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';
import { Sale } from '../../../db/sales/type/sale.type';
import { AddSaleDto } from '../dto/add-sale.dto';
import { UpdateSaleDto } from '../dto/update-sale.dto';

// The wire shape. Giftedness is stored as its own row (spec D14) but is served
// flattened onto the sale — `giftedAt` and `Recipient` at the top level, exactly
// as before the gift table existed. That is what keeps `web/` untouched and lets
// the api deploy without a matching web deploy (spec D17).
export type SaleResponse = Omit<Sale, 'Gift'> & {
    giftedAt: Date | null;
    Recipient: { id: RecipientId; name: string } | null;
};

export type FormattedSale = Omit<SaleResponse, 'Match' | 'userId' | 'matchId'> & {
    opponent: { id: OpponentId; name: string };
    matchDate: Date;
};

export abstract class ISalesService {
    abstract getSale(userId: UserId, saleId: SaleId): Promise<SaleResponse>;
    abstract getSales(userId: UserId): Promise<FormattedSale[]>;
    abstract getCurrentSeasonSales(userId: UserId): Promise<FormattedSale[]>;
    abstract getSeasonSales(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<FormattedSale[]>;
    abstract addSale(userId: UserId, payload: AddSaleDto): Promise<{ id: SaleId }>;
    abstract updateSale(userId: UserId, payload: UpdateSaleDto): Promise<void>;
    abstract getProfit(price: ListedPrice): Profit;
    abstract deleteSale(userId: UserId, saleId: SaleId): Promise<void>;
}
```

- [ ] **Step 6: Flatten in `src/api/sales/sales.service.ts`**

Change `getSale`'s return type and body, and route `formatSale` through the same helper:

```ts
    async getSale(userId: UserId, saleId: SaleId): Promise<SaleResponse> {
        const sale = await this.salesDbService.getOneSale(userId, saleId);

        if (!sale) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        return flattenGift(sale);
    }
```

```ts
    private formatSale(sale: Sale): FormattedSale {
        const flattened = flattenGift(sale);

        return {
            ...omit(flattened, ['Match', 'userId', 'matchId']),
            opponent: {
                id: sale.Match.Opponent.id,
                name: sale.Match.Opponent.name,
            },
            matchDate: sale.Match.date,
        };
    }
```

And add the module-level helper next to the file's other module-level functions:

```ts
// Giftedness lives in its own row (spec D14); the wire shape it replaced does
// not change (spec D17). One helper, used by every read path, is the whole of
// that promise — if it stops being applied somewhere, the frontend silently
// loses the recipient on that screen.
function flattenGift(sale: Sale): SaleResponse {
    const { Gift, ...rest } = sale;

    return {
        ...rest,
        giftedAt: Gift?.giftedAt ?? null,
        Recipient: Gift?.Recipient ?? null,
    };
}
```

Import `SaleResponse` alongside `FormattedSale` / `ISalesService`.

- [ ] **Step 7: Update the spec file's `saleFixture` so the existing suite compiles**

In `src/api/sales/sales.service.spec.ts`, add `Gift: null,` to the object returned by `saleFixture`, immediately after `cancelledAt: null,`, and delete any `recipientId` key it carries.

- [ ] **Step 8: Version the sale cache keys in `src/redis/CACHE_KEYS.ts`**

```ts
    // :v2 — the cached payload is the db-layer `Sale`, whose shape changed when
    // giftedness moved to its own joined row (spec D17). A warm pre-change entry
    // would flatten to a null recipient for up to an hour.
    sale: (saleId: string): CacheKey<Sale> => `sale:id:${saleId}:v2` as CacheKey<Sale>,
    sales: (userId: string): CacheKey<Sale[]> =>
        `user:id:${userId}:sales:v2` as CacheKey<Sale[]>,
    salesByRange: (userId: string, from: Date, to: Date): CacheKey<Sale[]> =>
        `user:id:${userId}:sales:v2:start:${from.toISOString()}:end:${to.toISOString()}` as CacheKey<
            Sale[]
        >,
```

`invalidateSales`'s pattern (`user:id:${userId}:sales*`) still matches all three — leave it alone.

- [ ] **Step 9: Run the tests**

Run: `npx jest src/api/sales/sales.service.spec.ts`
Expected: PASS, including the three new cases and every pre-existing guard case.

- [ ] **Step 10: Stage**

```bash
npm run format
git add src/db/sales/sales.query.ts src/db/sales/type/sale.type.ts src/api/sales/interfaces/sales.service.interface.ts src/api/sales/sales.service.ts src/api/sales/sales.service.spec.ts src/redis/CACHE_KEYS.ts
```

---

### Task 3: The db write path — three methods that cannot be used wrongly

**Files:**
- Modify: `src/db/sales/sales.db.interface.ts`
- Modify: `src/db/sales/sales.service.ts`
- Test: `src/db/sales/sales.service.spec.ts`

**Interfaces:**
- Consumes: `Gifts` from Task 1.
- Produces, for Task 4 and Task 7:

```ts
export type GiftRecipientInput = { recipientId: RecipientId } | { recipientName: string };

updateSale(payload: {
    saleId: SaleId; userId: UserId; profit: Profit | undefined;
    invest?: Invest; listedPrice?: ListedPrice;
    status?: 'PENDING' | 'SOLD';
    allocations?: SaleAllocationInput[];
}): Promise<void>;

giftSale(payload: {
    saleId: SaleId; userId: UserId; profit: Profit | undefined;
    invest?: Invest; listedPrice?: ListedPrice;
    recipient: GiftRecipientInput;
    allocations?: SaleAllocationInput[];
}): Promise<{ recipientId: RecipientId }>;

updateGift(payload: {
    saleId: SaleId; userId: UserId; profit: Profit | undefined;
    invest?: Invest; listedPrice?: ListedPrice;
    recipient?: GiftRecipientInput;
    allocations?: SaleAllocationInput[];
}): Promise<{ recipientId: RecipientId | null }>;

ungiftSale(userId: UserId, saleId: SaleId): Promise<void>;
```

> **Read first:** spec D15. The narrowing of `updateSale.status` is not cosmetic — it is enforcement layer 2, and a reviewer should reject any widening of it back to `SaleStatus`.

- [ ] **Step 1: Write the failing tests in `src/db/sales/sales.service.spec.ts`**

Replace the existing `describe('updateSale')` recipient cases (they test a shape that no longer exists) with:

```ts
    describe('giftSale', () => {
        beforeEach(() => {
            prismaService.sales.findUnique.mockResolvedValue(currentSaleRow() as never);
        });

        describe('when a new recipient name is given', () => {
            it('flips the status and writes the gift row on the same tx', async () => {
                const tx = mockTransaction();

                recipientsDbService.findOrCreateForUser.mockResolvedValueOnce({
                    id: 'r1' as RecipientId,
                    userId,
                    name: 'Marc',
                });

                await service.giftSale({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientName: 'Marc' },
                });

                expect(tx.sales.update).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({ status: SaleStatus.GIFTED }),
                    }),
                );
                expect(recipientsDbService.findOrCreateForUser).toHaveBeenCalledWith(
                    userId,
                    'Marc',
                    tx,
                );
                expect(tx.gifts.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            saleId,
                            saleStatus: SaleStatus.GIFTED,
                            recipientId: 'r1',
                        }),
                    }),
                );
            });

            it('sets the status before inserting the gift row', async () => {
                const tx = mockTransaction();
                const order: string[] = [];

                recipientsDbService.findOrCreateForUser.mockResolvedValueOnce({
                    id: 'r1' as RecipientId,
                    userId,
                    name: 'Marc',
                });
                (tx.sales.update as jest.Mock).mockImplementation(() => {
                    order.push('status');

                    return Promise.resolve({});
                });
                (tx.gifts.create as jest.Mock).mockImplementation(() => {
                    order.push('gift');

                    return Promise.resolve({});
                });

                await service.giftSale({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientName: 'Marc' },
                });

                expect(order).toEqual(['status', 'gift']);
            });
        });
    });

    describe('updateGift', () => {
        beforeEach(() => {
            prismaService.sales.findUnique.mockResolvedValue(
                currentSaleRow({ status: SaleStatus.GIFTED }) as never,
            );
        });

        describe('when a recipient is given', () => {
            it('updates the gift row and writes no status', async () => {
                const tx = mockTransaction();

                await service.updateGift({
                    saleId,
                    userId,
                    profit: undefined,
                    recipient: { recipientId: 'r2' as RecipientId },
                });

                expect(tx.gifts.update).toHaveBeenCalledWith({
                    where: { saleId },
                    data: { recipientId: 'r2' },
                });
                expect(tx.sales.update).not.toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({ status: expect.anything() }),
                    }),
                );
            });
        });
    });

    describe('ungiftSale', () => {
        beforeEach(() => {
            prismaService.sales.findUnique.mockResolvedValue(
                currentSaleRow({ status: SaleStatus.GIFTED }) as never,
            );
        });

        it('deletes the gift row before flipping the status back to PENDING', async () => {
            const tx = mockTransaction();
            const order: string[] = [];

            (tx.gifts.deleteMany as jest.Mock).mockImplementation(() => {
                order.push('delete');

                return Promise.resolve({ count: 1 });
            });
            (tx.sales.update as jest.Mock).mockImplementation(() => {
                order.push('status');

                return Promise.resolve({});
            });

            await service.ungiftSale(userId, saleId);

            expect(order).toEqual(['delete', 'status']);
            expect(tx.sales.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: SaleStatus.PENDING }),
                }),
            );
        });
    });

    describe('deleteSale', () => {
        it('removes the sale gift row inside the same transaction', async () => {
            const tx = mockTransaction();

            await service.deleteSale(userId, saleId);

            expect(tx.gifts.deleteMany).toHaveBeenCalledWith({ where: { saleId } });
        });
    });
```

Also drop `recipientId: null` from the `currentSaleRow` helper's default object and from its `overrides` type — the column is gone.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/db/sales/sales.service.spec.ts`
Expected: FAIL — `service.giftSale is not a function`.

- [ ] **Step 3: Rewrite the write half of `src/db/sales/sales.db.interface.ts`**

```ts
// A gift's recipient arrives either already resolved (an id the api layer
// validated as the user's own) or as a name to resolve-or-create. The name is
// resolved on the *same* transaction as the sale write, so a failed write
// cannot leave an orphaned recipient behind (spec D8).
export type GiftRecipientInput = { recipientId: RecipientId } | { recipientName: string };

export abstract class ISalesDbService {
    // … getOneSale / getSales / getSalesByRange / addSale unchanged …

    // Ordinary field and status edits. `status` deliberately cannot express
    // GIFTED: entering, changing and leaving that state is the exclusive
    // business of giftSale / updateGift / ungiftSale, each of which writes the
    // status and the gift row in one transaction (spec D15, layer 2). Widening
    // this back to `SaleStatus` reopens the exact hole this redesign closed.
    abstract updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        status?: 'PENDING' | 'SOLD';
        allocations?: SaleAllocationInput[];
    }): Promise<void>;

    // PENDING -> GIFTED. Sets the status and inserts the gift row in one
    // transaction, in that order — the composite foreign key rejects the
    // reverse order outright.
    abstract giftSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
    }): Promise<{ recipientId: RecipientId }>;

    // GIFTED -> GIFTED. Attaches, corrects or reuses the recipient on an
    // existing gift row. Writes no status at all. `recipient` omitted is the
    // deliberate no-op of spec D9.
    abstract updateGift(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient?: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
    }): Promise<{ recipientId: RecipientId | null }>;

    // The sanctioned manual repair (spec D16). No controller reaches it:
    // GIFTED is terminal in the app (spec D5). Deletes the gift row and flips
    // the status back to PENDING in one transaction, never one without the
    // other.
    abstract ungiftSale(userId: UserId, saleId: SaleId): Promise<void>;

    // … deleteSale / getOneByWithFullMatch / cancelMany / getOldestMatchSale unchanged …
}
```

- [ ] **Step 4: Rewrite the write half of `src/db/sales/sales.service.ts`**

Delete the `recipientId` / `recipientName` handling and the `giftedAt` branch of `timestampPatch`, and add the shared private helper plus the three methods:

```ts
    // Everything every write path does to the sale row itself: the timestamp
    // mirror, the row update, the allocation replacement and the history entry.
    // Extracted so giftSale / updateGift / ungiftSale / updateSale differ only
    // in the gift write they wrap it with.
    private async applySaleWrite(
        tx: Prisma.TransactionClient,
        currentSale: { id: string; status: SaleStatus; listedPrice: number; profit: number },
        payload: {
            saleId: SaleId;
            userId: UserId;
            profit: Profit | undefined;
            invest?: Invest;
            listedPrice?: ListedPrice;
            status?: SaleStatus;
            allocations?: SaleAllocationInput[];
        },
    ): Promise<void> {
        const nextStatus: SaleStatus = payload.status ?? currentSale.status;

        const wasSold = currentSale.status === SaleStatus.SOLD;
        const willBeSold = nextStatus === SaleStatus.SOLD;
        const wasCancelled = currentSale.status === SaleStatus.CANCELLED;
        const willBeCancelled = nextStatus === SaleStatus.CANCELLED;

        // soldAt / cancelledAt mirror the current status: set on entry into the
        // state, null on exit. There is no giftedAt branch — a gift's timestamp
        // lives on the gift row and is created and destroyed with it (spec D14,
        // superseding D6).
        const timestampPatch: { soldAt?: Date | null; cancelledAt?: Date | null } = {};

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

        const nbTicketsPatch =
            payload.allocations != null
                ? { nbTickets: sumTickets(payload.allocations) }
                : {};

        // `shake` strips `undefined` (fields not being touched) but would also
        // strip a deliberate `null` (a timestamp nulled on exit), so the
        // timestamp patch is spread back in after.
        await tx.sales.update({
            data: {
                ...shake({
                    profit: payload.profit,
                    invest: payload.invest,
                    listedPrice: payload.listedPrice,
                    status: nextStatus,
                    ...nbTicketsPatch,
                }),
                ...timestampPatch,
            },
            where: {
                id: payload.saleId,
                userId: payload.userId,
            },
        });

        if (payload.allocations != null) {
            await tx.salePassAllocations.deleteMany({ where: { saleId: payload.saleId } });
            await tx.salePassAllocations.createMany({
                data: payload.allocations.map((allocation) => ({
                    saleId: payload.saleId,
                    seasonPassId: allocation.seasonPassId,
                    nbTickets: allocation.nbTickets,
                })),
            });
        }

        await tx.saleHistories.create({
            data: {
                saleId: currentSale.id,
                listedPrice: currentSale.listedPrice,
                profit: currentSale.profit,
                status: currentSale.status,
            },
        });
    }

    private async resolveRecipientId(
        tx: Prisma.TransactionClient,
        userId: UserId,
        recipient: GiftRecipientInput,
    ): Promise<RecipientId> {
        if ('recipientId' in recipient) {
            return recipient.recipientId;
        }

        // Resolved (or created) on this same `tx`, so a rollback of the sale
        // write rolls a newly created recipient back too (spec D8).
        const resolved = await this.recipientsDbService.findOrCreateForUser(
            userId,
            recipient.recipientName,
            tx,
        );

        return resolved.id;
    }

    private async loadSaleRowOrThrow(
        userId: UserId,
        saleId: SaleId,
    ): Promise<{ id: string; status: SaleStatus; listedPrice: number; profit: number }> {
        const currentSale = await this.prisma.sales.findUnique({
            where: { userId, id: saleId },
        });

        if (!currentSale) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        return currentSale;
    }

    private async invalidateSaleCaches(userId: UserId, saleId: SaleId): Promise<void> {
        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId));
        await this.redisService.invalidate(CACHE_KEYS.sale(saleId));
    }

    async updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        status?: 'PENDING' | 'SOLD';
        allocations?: SaleAllocationInput[];
    }): Promise<void> {
        const currentSale = await this.loadSaleRowOrThrow(payload.userId, payload.saleId);

        await this.prisma.$transaction(async (tx) => {
            await this.applySaleWrite(tx, currentSale, payload);
        });

        await this.invalidateSaleCaches(payload.userId, payload.saleId);
    }

    async giftSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
    }): Promise<{ recipientId: RecipientId }> {
        const currentSale = await this.loadSaleRowOrThrow(payload.userId, payload.saleId);

        // Prisma's interactive transaction hands back whatever the callback
        // returns, which keeps the resolved id out of a mutable outer binding.
        const recipientId = await this.prisma.$transaction(async (tx) => {
            // Status first: the (sale_id, sale_status) foreign key means a gift
            // row can only be inserted against a sale that is *already* GIFTED.
            // The order is the database's rule, not a convention (spec D15).
            await this.applySaleWrite(tx, currentSale, {
                ...payload,
                status: SaleStatus.GIFTED,
            });

            const resolvedRecipientId = await this.resolveRecipientId(
                tx,
                payload.userId,
                payload.recipient,
            );

            await tx.gifts.create({
                data: {
                    saleId: payload.saleId,
                    saleStatus: SaleStatus.GIFTED,
                    recipientId: resolvedRecipientId,
                    giftedAt: new Date(),
                },
            });

            return resolvedRecipientId;
        });

        await this.invalidateSaleCaches(payload.userId, payload.saleId);

        return { recipientId };
    }

    async updateGift(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient?: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
    }): Promise<{ recipientId: RecipientId | null }> {
        const currentSale = await this.loadSaleRowOrThrow(payload.userId, payload.saleId);

        const recipientId = await this.prisma.$transaction(async (tx) => {
            // No status write at all: the sale is already GIFTED and stays
            // GIFTED, so there is no transition to make (spec D5's exemption).
            await this.applySaleWrite(tx, currentSale, payload);

            if (payload.recipient == null) {
                const existingGift = await tx.gifts.findUnique({
                    where: { saleId: payload.saleId },
                    select: { recipientId: true },
                });

                return (existingGift?.recipientId ?? null) as RecipientId | null;
            }

            const resolvedRecipientId = await this.resolveRecipientId(
                tx,
                payload.userId,
                payload.recipient,
            );

            await tx.gifts.update({
                where: { saleId: payload.saleId },
                data: { recipientId: resolvedRecipientId },
            });

            return resolvedRecipientId as RecipientId | null;
        });

        await this.invalidateSaleCaches(payload.userId, payload.saleId);

        return { recipientId };
    }

    async ungiftSale(userId: UserId, saleId: SaleId): Promise<void> {
        const currentSale = await this.loadSaleRowOrThrow(userId, saleId);

        await this.prisma.$transaction(async (tx) => {
            // Gift row first, then the status. The reverse order is not a style
            // preference — Postgres rejects it (spec D15).
            await tx.gifts.deleteMany({ where: { saleId } });

            await this.applySaleWrite(tx, currentSale, {
                saleId,
                userId,
                profit: undefined,
                status: SaleStatus.PENDING,
            });
        });

        await this.invalidateSaleCaches(userId, saleId);
    }
```

In `deleteSale`, add the gift cleanup as the first statement inside the existing `$transaction` (the `ON DELETE CASCADE` would cover it, but every other child of a sale is deleted explicitly here and the symmetry is worth more than the saved line):

```ts
            await tx.gifts.deleteMany({ where: { saleId } });
```

Update the file's imports: add `GiftRecipientInput` to the `./sales.db.interface` import, keep `RecipientId`, keep `Prisma` (now used by the helper signatures).

- [ ] **Step 5: Run the tests**

Run: `npx jest src/db/sales/sales.service.spec.ts`
Expected: PASS, all suites.

- [ ] **Step 6: Stage**

```bash
npm run format
git add src/db/sales/sales.db.interface.ts src/db/sales/sales.service.ts src/db/sales/sales.service.spec.ts
```

---

### Task 4: The api write path — route each intent to the method that owns it

**Files:**
- Modify: `src/api/sales/sales.service.ts`
- Test: `src/api/sales/sales.service.spec.ts`

**Interfaces:**
- Consumes: `giftSale`, `updateGift`, `updateSale`, `ungiftSale` and `GiftRecipientInput` from Task 3; `SaleResponse` / `flattenGift` from Task 2.
- Produces: `SalesService.ungiftSale(userId: UserId, saleId: SaleId): Promise<void>` for Task 7's script.

> **Read first:** spec D5 (the matrix and the entry-scoped kickoff guard — unchanged, do not touch) and D9 (the blank-name no-op). This task changes *where writes go*, not *which writes are allowed*.

- [ ] **Step 1: Write the failing tests in `src/api/sales/sales.service.spec.ts`**

```ts
    describe('routing a write to the db layer', () => {
        describe('when a PENDING sale is gifted before kickoff', () => {
            it('calls giftSale and never the generic update', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce({
                    ...saleFixture(new Date(Date.now() + 86_400_000)),
                    Gift: null,
                } as unknown as Sale);
                salesDbService.giftSale.mockResolvedValueOnce({
                    recipientId: 'r1' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(salesDbService.giftSale).toHaveBeenCalledWith(
                    expect.objectContaining({
                        saleId,
                        userId,
                        recipient: { recipientName: 'Marc' },
                    }),
                );
                expect(salesDbService.updateSale).not.toHaveBeenCalled();
            });
        });

        describe('when an already-GIFTED sale gets a new recipient after kickoff', () => {
            it('calls updateGift and sends no status', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce({
                    ...saleFixture(new Date(Date.now() - 86_400_000), SaleStatus.GIFTED),
                    Gift: {
                        giftedAt: new Date(),
                        recipientId: 'r1' as RecipientId,
                        Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                    },
                } as unknown as Sale);
                salesDbService.updateGift.mockResolvedValueOnce({
                    recipientId: 'r2' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Ana',
                } as UpdateSaleDto);

                expect(salesDbService.updateGift).toHaveBeenCalledWith(
                    expect.objectContaining({ recipient: { recipientName: 'Ana' } }),
                );
                expect(salesDbService.giftSale).not.toHaveBeenCalled();
                expect(salesDbService.updateSale).not.toHaveBeenCalled();
            });

            it('invalidates the recipients cache when the recipient changed', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce({
                    ...saleFixture(new Date(Date.now() - 86_400_000), SaleStatus.GIFTED),
                    Gift: {
                        giftedAt: new Date(),
                        recipientId: 'r1' as RecipientId,
                        Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                    },
                } as unknown as Sale);
                salesDbService.updateGift.mockResolvedValueOnce({
                    recipientId: 'r2' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Ana',
                } as UpdateSaleDto);

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when a PENDING sale is marked SOLD', () => {
            it('calls the generic update with the narrowed status', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce({
                    ...saleFixture(new Date(Date.now() + 86_400_000)),
                    Gift: null,
                } as unknown as Sale);

                await service.updateSale(userId, {
                    saleId,
                    status: 'SOLD',
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'SOLD' }),
                );
                expect(salesDbService.giftSale).not.toHaveBeenCalled();
            });
        });
    });

    describe('ungiftSale', () => {
        describe('when the sale is GIFTED', () => {
            it('delegates to the db layer and clears the recipients cache', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce({
                    ...saleFixture(new Date(Date.now() - 86_400_000), SaleStatus.GIFTED),
                    Gift: {
                        giftedAt: new Date(),
                        recipientId: 'r1' as RecipientId,
                        Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                    },
                } as unknown as Sale);

                await service.ungiftSale(userId, saleId);

                expect(salesDbService.ungiftSale).toHaveBeenCalledWith(userId, saleId);
                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when the sale is not GIFTED', () => {
            it('rejects with SALE_INVALID_STATUS_TRANSITION', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce({
                    ...saleFixture(new Date(Date.now() - 86_400_000)),
                    Gift: null,
                } as unknown as Sale);

                await expect(service.ungiftSale(userId, saleId)).rejects.toThrow(
                    DomainException,
                );
                expect(salesDbService.ungiftSale).not.toHaveBeenCalled();
            });
        });
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/api/sales/sales.service.spec.ts -t "routing a write"`
Expected: FAIL — `salesDbService.giftSale` was not called (everything still goes through `updateSale`).

- [ ] **Step 3: Replace `updateSale`'s tail in `src/api/sales/sales.service.ts`**

Keep the existing head verbatim — the `SALE_NOT_FOUND` check, `resolveTargetStatus`, `isLegalTransition`, `isKickoffGuarded` and `validateAllocations` blocks do not change. Replace everything from the `recipientPatch` assignment to the end of the method with:

```ts
        const fieldPatch = {
            saleId: payload.saleId,
            userId,
            profit: payload.listedPrice ? this.getProfit(payload.listedPrice) : undefined,
            ...(payload.invest !== undefined ? { invest: payload.invest } : {}),
            ...(payload.listedPrice !== undefined
                ? { listedPrice: payload.listedPrice }
                : {}),
            ...(payload.allocations ? { allocations: payload.allocations } : {}),
        };

        // Three intents, three db methods. Which one runs is decided here, once,
        // from the pair (current status, target status) — and each of them writes
        // the sale and its gift row in a single transaction (spec D15).
        if (target === 'GIFTED' && existing.status !== 'GIFTED') {
            // Entry always moves a gift count — the sale had no gift a moment
            // ago — so the resolved id is not needed to decide anything here.
            await this.salesDbService.giftSale({
                ...fieldPatch,
                recipient: await this.resolveNewGiftRecipient(userId, payload),
            });

            await this.invalidateAfterWrite(userId, { recipientChanged: true });

            return;
        }

        if (target === 'GIFTED') {
            const recipient = await this.resolveExistingGiftRecipient(
                userId,
                payload,
                existing,
            );
            const { recipientId } = await this.salesDbService.updateGift({
                ...fieldPatch,
                ...(recipient != null ? { recipient } : {}),
            });

            await this.invalidateAfterWrite(userId, {
                recipientChanged: recipientId !== (existing.Gift?.recipientId ?? null),
            });

            return;
        }

        await this.salesDbService.updateSale({
            ...fieldPatch,
            ...(target !== undefined ? { status: target } : {}),
        });

        await this.invalidateAfterWrite(userId, { recipientChanged: false });
```

Note the `target` in that last call is `'PENDING' | 'SOLD'` by elimination — both `GIFTED` branches returned above. If TypeScript does not narrow it on its own, add `status: target as 'PENDING' | 'SOLD'` with a comment pointing at the two returns, rather than widening the db signature.

- [ ] **Step 4: Replace `resolveRecipient` with the two intent-specific resolvers**

```ts
    // Entry into GIFTED. A recipient is mandatory (spec D9): the combobox always
    // sends one, and an empty submit is a user error, not a gift with no name.
    private async resolveNewGiftRecipient(
        userId: UserId,
        payload: UpdateSaleDto,
    ): Promise<GiftRecipientInput> {
        if (payload.recipientId != null) {
            return { recipientId: await this.assertOwnedRecipient(userId, payload.recipientId) };
        }

        const name = normalizeRecipientName(payload.recipientName ?? '');

        if (name.length === 0) {
            throw new DomainException(ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED);
        }

        return { recipientName: name };
    }

    // A sale that is already GIFTED. `undefined` means "leave the recipient
    // alone" — the genuine no-op of an unrelated-field edit that resubmits the
    // unchanged status (spec D9). A gift that has no recipient yet (the
    // CSV-imported case, spec D10) still requires one.
    private async resolveExistingGiftRecipient(
        userId: UserId,
        payload: UpdateSaleDto,
        existing: Sale,
    ): Promise<GiftRecipientInput | undefined> {
        if (payload.recipientId != null) {
            return { recipientId: await this.assertOwnedRecipient(userId, payload.recipientId) };
        }

        const name = normalizeRecipientName(payload.recipientName ?? '');

        if (name.length === 0) {
            if (existing.Gift?.recipientId != null) {
                return undefined;
            }

            throw new DomainException(ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED);
        }

        return { recipientName: name };
    }

    private async assertOwnedRecipient(
        userId: UserId,
        recipientId: RecipientId,
    ): Promise<RecipientId> {
        const owned = await this.recipientsDbService.findByIdForUser(recipientId, userId);

        if (owned == null) {
            throw new DomainException(ErrorCode.SALE_GIFT_RECIPIENT_NOT_FOUND);
        }

        return owned.id;
    }

    private async invalidateAfterWrite(
        userId: UserId,
        options: { recipientChanged: boolean },
    ): Promise<void> {
        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateAccounting(userId));

        // The combobox orders by giftCount, which only moves when a gift is
        // created, retargeted or destroyed.
        if (options.recipientChanged) {
            await this.redisService.invalidatePattern(CACHE_KEYS.invalidateRecipients(userId));
        }
    }
```

Delete the module-level `recipientGiftCountChanged` helper entirely — the branches above now say the same thing where the decision is made, and the old function's "did the sale leave GIFTED" arm is unreachable (nothing but `ungiftSale` can leave, and it invalidates on its own).

- [ ] **Step 5: Add the un-gift orchestration**

```ts
    // The sanctioned manual repair for a sale gifted by mistake (spec D16).
    // Deliberately NOT exposed by SalesController: GIFTED is terminal in the app
    // (spec D5). Its caller is scripts/ungift-sale.ts. It lives here, not in the
    // script, so the cache invalidation stays with the rest of the write logic.
    async ungiftSale(userId: UserId, saleId: SaleId): Promise<void> {
        const existing = await this.salesDbService.getOneSale(userId, saleId);

        if (!existing) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        if (existing.status !== 'GIFTED') {
            throw new DomainException(ErrorCode.SALE_INVALID_STATUS_TRANSITION);
        }

        await this.salesDbService.ungiftSale(userId, saleId);

        await this.invalidateAfterWrite(userId, { recipientChanged: true });
    }
```

Add it to `ISalesService` in `src/api/sales/interfaces/sales.service.interface.ts`:

```ts
    abstract ungiftSale(userId: UserId, saleId: SaleId): Promise<void>;
```

- [ ] **Step 6: Simplify `deleteSale`'s invalidation**

```ts
        // Deleting a GIFTED sale destroys its gift row with it (ON DELETE
        // CASCADE plus the explicit delete in the db layer), which moves the
        // recipient's giftCount — the combobox's sort key.
        await this.invalidateAfterWrite(userId, {
            recipientChanged: existing?.status === 'GIFTED',
        });
```

Replacing the two separate `invalidatePattern` calls at the end of the method.

- [ ] **Step 7: Run the whole api suite**

Run: `npx jest src/api/sales/sales.service.spec.ts`
Expected: PASS — the new routing and ungift cases *and* every pre-existing guard case from the D5 correction round.

- [ ] **Step 8: Stage**

```bash
npm run format
git add src/api/sales/sales.service.ts src/api/sales/interfaces/sales.service.interface.ts src/api/sales/sales.service.spec.ts
```

---

### Task 5: `giftCount` counts gift rows

**Files:**
- Modify: `src/db/recipients/recipients.service.ts:25-44`
- Test: `src/db/recipients/recipients.service.spec.ts`

**Interfaces:**
- Consumes: `Recipients.Gifts` from Task 1.
- Produces: nothing new — `RecipientWithGiftCount` and the `GET /recipients` contract are unchanged.

> **Read first:** spec D8's revision note. The `where: { status: GIFTED }` filter disappears because it became structurally redundant, not because the count changed meaning.

- [ ] **Step 1: Update the failing test in `src/db/recipients/recipients.service.spec.ts`**

Replace the `_count: { Sales: n }` fixtures in the listing test with the gift relation, and pin the absent filter:

```ts
        it('returns recipients with their gift count', async () => {
            prisma.recipients.findMany.mockResolvedValueOnce([
                { id: 'r1', userId, name: 'Marc', _count: { Gifts: 3 } },
                { id: 'r2', userId, name: 'Ana', _count: { Gifts: 1 } },
            ] as never);

            const result = await service.listForUser(userId);

            expect(result).toEqual([
                { id: 'r1', userId, name: 'Marc', giftCount: 3 },
                { id: 'r2', userId, name: 'Ana', giftCount: 1 },
            ]);
            expect(prisma.recipients.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId },
                    select: expect.objectContaining({
                        _count: { select: { Gifts: true } },
                    }),
                }),
            );
        });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/db/recipients/recipients.service.spec.ts -t "gift count"`
Expected: FAIL — received `_count: { select: { Sales: { where: … } } }`.

- [ ] **Step 3: Change the aggregation in `src/db/recipients/recipients.service.ts`**

```ts
                const rows = await this.prisma.recipients.findMany({
                    where: { userId },
                    select: {
                        id: true,
                        userId: true,
                        name: true,
                        // No status filter: a gift row cannot exist against a
                        // non-GIFTED sale (spec D15), so counting rows is
                        // correct by construction rather than by remembering
                        // to filter.
                        _count: { select: { Gifts: true } },
                    },
                    orderBy: { name: 'asc' },
                });

                return rows.map((row) => ({
                    id: row.id,
                    userId: row.userId,
                    name: row.name,
                    giftCount: row._count.Gifts,
                })) as RecipientWithGiftCount[];
```

Drop the now-unused `SaleStatus` import from `@prisma/client` if nothing else in the file uses it.

- [ ] **Step 4: Run the suite**

Run: `npx jest src/db/recipients/recipients.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
npm run format
git add src/db/recipients/recipients.service.ts src/db/recipients/recipients.service.spec.ts
```

---

### Task 6: CSV import creates the gift row

**Files:**
- Modify: `src/db/sales-import/sales-import.service.ts:19-45` and its `deleteBatch`
- Test: `src/db/sales-import/sales-import.service.spec.ts`

**Interfaces:**
- Consumes: `Gifts` from Task 1. `BulkSaleInput` is unchanged — it still carries `status` and `giftedAt`.
- Produces: nothing new.

> **Read first:** spec D10's revision note. An imported `GIFTED` sale with no gift row is precisely the incoherent state this redesign forbids, and the recipient could never be attached afterwards.

- [ ] **Step 1: Write the failing test in `src/db/sales-import/sales-import.service.spec.ts`**

```ts
    describe('when a committed row is GIFTED', () => {
        it('creates the gift row alongside the sale, in the same transaction', async () => {
            const tx = mockTransaction();

            (tx.sales.create as jest.Mock).mockResolvedValue({ id: 'sale-1' });

            await service.bulkCreate({
                userId,
                batchId: 'batch-1',
                sales: [giftedSaleInput({ giftedAt: new Date('2026-03-01T12:00:00.000Z') })],
            });

            expect(tx.gifts.create).toHaveBeenCalledWith({
                data: {
                    saleId: 'sale-1',
                    saleStatus: SaleStatus.GIFTED,
                    giftedAt: new Date('2026-03-01T12:00:00.000Z'),
                },
            });
        });
    });

    describe('when a committed row is SOLD', () => {
        it('creates no gift row', async () => {
            const tx = mockTransaction();

            (tx.sales.create as jest.Mock).mockResolvedValue({ id: 'sale-1' });

            await service.bulkCreate({
                userId,
                batchId: 'batch-1',
                sales: [soldSaleInput()],
            });

            expect(tx.gifts.create).not.toHaveBeenCalled();
        });
    });
```

Add `giftedSaleInput` / `soldSaleInput` fixture helpers returning a complete `BulkSaleInput` (`matchId`, `listedPrice`, `invest`, `profit`, `nbTickets`, `status`, `soldAt`, `giftedAt`, `allocations: []`), and a `mockTransaction()` helper in the same shape as the one in `src/db/sales/sales.service.spec.ts`. If the spec file has no Prisma mock scaffolding yet, copy the `beforeEach` block from `src/db/recipients/recipients.service.spec.ts` and swap the service.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/db/sales-import/sales-import.service.spec.ts`
Expected: FAIL — `tx.gifts.create` was not called.

- [ ] **Step 3: Create the gift row in `bulkCreate`**

```ts
        await this.prisma.$transaction(async (tx) => {
            for (const sale of payload.sales) {
                const created = await tx.sales.create({
                    data: {
                        userId: payload.userId,
                        matchId: sale.matchId,
                        listedPrice: sale.listedPrice,
                        invest: sale.invest,
                        profit: sale.profit,
                        nbTickets: sale.nbTickets,
                        status: sale.status,
                        soldAt: sale.soldAt,
                        importBatchId: payload.batchId,
                        Allocations: {
                            create: sale.allocations.map((allocation) => ({
                                seasonPassId: allocation.seasonPassId,
                                nbTickets: allocation.nbTickets,
                            })),
                        },
                    },
                    select: { id: true },
                });

                // An imported gift arrives with no recipient by construction —
                // there is no recipient column in the CSV (spec D10). The row
                // still has to exist: it is what makes the sale gifted, and what
                // the user attaches a recipient to afterwards.
                if (sale.status === SaleStatus.GIFTED) {
                    await tx.gifts.create({
                        data: {
                            saleId: created.id,
                            saleStatus: SaleStatus.GIFTED,
                            giftedAt: sale.giftedAt,
                        },
                    });
                }
            }
        });
```

`giftedAt` is nullable on the gift row, so a gift row with no date is fine — it means "given away, date unknown" (spec D14).

Add `import { SaleStatus } from '@prisma/client';` at the top of the file.

- [ ] **Step 4: Drop gift rows in `deleteBatch`**

Add to the `$transaction` array, **before** `sales.deleteMany`:

```ts
            this.prisma.gifts.deleteMany({
                where: { saleId: { in: saleIds } },
            }),
```

- [ ] **Step 5: Run the suite**

Run: `npx jest src/db/sales-import`
Expected: PASS.

- [ ] **Step 6: Stage**

```bash
npm run format
git add src/db/sales-import/sales-import.service.ts src/db/sales-import/sales-import.service.spec.ts
```

---

### Task 7: The seed script and the operator's un-gift command

**Files:**
- Modify: `scripts/seed-demo.ts:73-106` and `:190-205`
- Create: `scripts/ungift-sale.ts`
- Modify: `package.json` (one script entry)

**Interfaces:**
- Consumes: `SalesService.ungiftSale(userId, saleId)` from Task 4; `Gifts` from Task 1.
- Produces: `npm run ungift -- <userId> <saleId>`.

> **Read first:** spec D16. The script exists because D15 makes the naive one-line `UPDATE` fail, and an operator should not be left to work out the right pair of statements under pressure.

- [ ] **Step 1: Update `addSale` in `scripts/seed-demo.ts`**

Remove `recipientId` and `giftedAt` from the `prisma.sales.create` data, capture the id, and create the gift row:

```ts
    const created = await prisma.sales.create({
        data: {
            userId: params.userId,
            matchId: params.matchId,
            listedPrice: params.listedPrice,
            invest: params.invest,
            profit: profitOf(params.listedPrice),
            nbTickets,
            status: params.status,
            soldAt: params.soldAt,
            Allocations: {
                create: params.allocations.map((allocation) => ({
                    seasonPassId: allocation.seasonPassId,
                    nbTickets: allocation.nbTickets,
                })),
            },
        },
        select: { id: true },
    });

    if (params.status === SaleStatus.GIFTED) {
        await prisma.gifts.create({
            data: {
                saleId: created.id,
                saleStatus: SaleStatus.GIFTED,
                recipientId: params.recipientId,
                giftedAt: new Date(),
            },
        });
    }
```

The `recipientId: string | null` parameter and every call site stay exactly as they are.

- [ ] **Step 2: Re-run the seed against a fresh database**

```bash
npx prisma migrate reset --force --schema src/prisma/schema.prisma
npm run local:db:seed
```

Expected: no error, and:

```bash
docker exec -i psg-inventory-db psql -U postgres -d psg_inventory -c "SELECT s.status, g.recipient_id IS NOT NULL AS has_recipient FROM sales s JOIN gifts g ON g.sale_id = s.id;"
```

prints two rows, both `GIFTED | t`, and:

```bash
docker exec -i psg-inventory-db psql -U postgres -d psg_inventory -c "SELECT count(*) FROM sales WHERE status = 'GIFTED' AND id NOT IN (SELECT sale_id FROM gifts);"
```

prints `0` — no gifted sale without a gift row.

- [ ] **Step 3: Write `scripts/ungift-sale.ts`**

```ts
import { NestFactory } from '@nestjs/core';

import type { SaleId, UserId } from '@psg/shared/ids';
import { AppModule } from '../src/app.module';
import { ISalesService } from '../src/api/sales/interfaces/sales.service.interface';

// The sanctioned repair for a sale gifted by mistake. GIFTED is terminal in the
// app (spec D5), and since the gift row pins the sale's status at the database
// level (spec D15), `UPDATE sales SET status = 'PENDING'` typed into psql now
// fails outright. This is the supported way to do it: one command, one
// transaction, caches invalidated.
//
//   npm run ungift -- <userId> <saleId>
async function main(): Promise<void> {
    const [userId, saleId] = process.argv.slice(2);

    if (userId == null || saleId == null) {
        throw new Error('usage: npm run ungift -- <userId> <saleId>');
    }

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    try {
        const salesService = app.get(ISalesService);

        await salesService.ungiftSale(userId as UserId, saleId as SaleId);

        console.log(`sale ${saleId} is no longer gifted — status is PENDING`);
    } finally {
        await app.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
```

- [ ] **Step 4: Add the npm script**

In `package.json`, next to `local:db:seed`:

```json
    "ungift": "npx ts-node scripts/ungift-sale.ts"
```

- [ ] **Step 5: Run it end to end against the seeded database**

```bash
docker exec -i psg-inventory-db psql -U postgres -d psg_inventory -c "SELECT s.id, s.user_id FROM sales s JOIN gifts g ON g.sale_id = s.id LIMIT 1;"
npm run ungift -- <user_id from above> <id from above>
docker exec -i psg-inventory-db psql -U postgres -d psg_inventory -c "SELECT status FROM sales WHERE id = '<id from above>'; SELECT count(*) FROM gifts WHERE sale_id = '<id from above>';"
```

Expected: the command prints the success line; the status is `PENDING`; the gift count is `0`.

- [ ] **Step 6: Stage**

```bash
npm run format
git add scripts/seed-demo.ts scripts/ungift-sale.ts package.json
```

---

### Task 8: Whole-system verification

**Files:** none modified — this task only runs things and reports.

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: the evidence the user needs before approving a commit.

> **Read first:** spec D17 and D18. Two of the checks below exist specifically to prove the blast radius claim — that `web/` and the accounting layer were not supposed to move, and did not.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output. Any surviving reference to `sale.recipientId` or `sale.giftedAt` shows up here.

- [ ] **Step 2: Lint**

Run: `npm run lint -- --max-warnings 0`
Expected: exit 0.

- [ ] **Step 3: Full backend test suite**

Run: `npm test`
Expected: all suites pass. Pay attention to `src/api/accounting/**` — those specs must pass **unmodified** (spec D18); if one needed editing, the accounting layer was touched and it should not have been.

- [ ] **Step 4: Prove the frontend did not move**

Run: `git status --porcelain web/`
Expected: the pre-existing modified files from the original `GIFTED` release, and **nothing newly changed by this plan**. Compare against the list recorded before Task 1 started. A newly modified `web/` file means the flattening in Task 2 is wrong (spec D17).

- [ ] **Step 5: Re-run the database constraint proof**

```bash
docker exec -i psg-inventory-db psql -U postgres -d psg_inventory -v ON_ERROR_STOP=0 -f - < scripts/verify-gift-constraints.sql
```

Expected: the same three errors, in the same three places, as in Task 1 Step 11.

- [ ] **Step 6: Manual smoke test of the three write paths**

Start the api (`npm run start:dev`) and the web app (`cd web && npm run dev`), sign in as the demo user, and check:

1. On a `PENDING` sale whose match is in the future: type a new name in the recipient combobox, submit. The row shows `GIFTED`, the detail page shows the recipient and the gift date.
2. On that same now-`GIFTED` sale: submit a different name. The recipient changes; the status stays `GIFTED`; the combobox reorders by gift count on the next load.
3. On a `GIFTED` sale whose match has been played: the recipient field is still offered and still works (spec D5's exemption, D10's CSV case).
4. The accounting page still shows "of which gifted" under Unrealized with the same figure as before the change.

- [ ] **Step 7: Report, do not commit**

Summarize for the user: every staged file, the constraint-proof output, the test counts, and the confirmation that `web/` is untouched. Then stop — the user runs `/crit` on the staged diff and decides when to commit.

---

## Parallelizability

**This work is backend-only. Zero frontend tasks** — no file under `web/` changes (spec D17), so there is nothing for a frontend builder to do and no need to coordinate two builders.

Within the backend:

- **Task 1 must land first and alone.** Every other task depends on the generated Prisma client and on the migrated local database.
- **Tasks 2, 5, 6 and 7 (Step 1–2 only) are independent of each other** once Task 1 is done. Different files, no shared symbols.
- **Task 3 → Task 4 is a hard chain** (Task 4 consumes the db signatures Task 3 defines), and **Task 2 → Task 4** as well (Task 4's tests use the `Gift`-shaped fixture Task 2 introduces).
- **Task 7 Steps 3–5 depend on Task 4** (`SalesService.ungiftSale`).
- **Task 8 is last.**

A sensible split for two workers: one takes 1 → 2 → 3 → 4 → 7, the other takes 5 and 6 as soon as Task 1 reports done. The saving is maybe twenty minutes; sequential execution by a single builder is entirely reasonable here, and the chain 1→2→3→4 is the bulk of the work either way.
