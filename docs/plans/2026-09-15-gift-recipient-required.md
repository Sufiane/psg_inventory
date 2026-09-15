# Gift Recipient and Date Become Required — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `gifts.recipient_id` and `gifts.gifted_at` `NOT NULL`, by closing the one path that could produce a gift without either — CSV import. The CSV gains a `recipient` column, required on `GIFTED` rows; a `GIFTED` row with no date falls back to its match's date. The net effect on the codebase is a **deletion**: every branch that existed to describe a recipient-less gift goes away.

**Architecture:** Three things change shape and everything else follows from them. (1) The `gifts` table: `recipient_id TEXT NOT NULL`, `gifted_at TIMESTAMP(3) NOT NULL`, and the recipient foreign key moves from `ON DELETE SET NULL` to `ON DELETE RESTRICT` — forced, since `SET NULL` cannot be expressed against a non-null column, and correct, since `CASCADE` would delete gift rows and silently un-gift their sales. (2) The CSV pipeline: an optional `recipient` header, a per-row requirement on `GIFTED` rows surfaced as a new `error:gift-recipient-missing` `DraftRowStatus`, and a `gift: { recipientName, giftedAt }` object on `BulkSaleInput` that is non-null exactly when the row is `GIFTED`. `bulkCreate` resolves-or-creates the recipient on its own transaction, the same `findOrCreateForUser(userId, name, tx)` call `giftSale` already makes. (3) The deletions: the recipient-less branch of `SalesService.resolveExistingGiftRecipient`, the `hasRecipient` hidden field and its server-side check, and the `|| editSale.Recipient == null` arm of the combobox's `required` attribute.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (`src/`), Jest + `jest-mock-extended` for backend unit tests, docker-compose Postgres for the constraint verification (`npm run local:db:up`). SvelteKit 2 + Svelte 5 + Vitest (`web/`).

## Global Constraints

- **Spec of record:** `docs/specs/2026-09-11-gifted-sale-status-design.md`, revision round **2026-09-15**. Read the third *Revisions* entry, then **D9**, **D10**, the `recipient_id` / `gifted_at` field notes in **D14**, and the 2026-09-15 addendum to **D19** before starting. D1–D8 and D11–D18 describe behaviour this plan must preserve unchanged, not reimplement.
- **This feature is unreleased and the migration is uncommitted.** Edit `src/prisma/migrations/20260911120100_add_recipients_and_gifts/migration.sql` **in place**. No new migration, no `ALTER TABLE`, no backfill. `npx prisma migrate reset` against local dev is expected and approved (spec D19, 2026-09-15 addendum).
- **`GIFTED` exists only in this branch**, so no CSV anywhere has a `GIFTED` row. The new CSV contract breaks nothing and needs no compatibility shim.
- **`SaleResponse.Recipient` stays nullable.** A non-gifted sale has no gift row. If a task appears to require making it non-null, stop and escalate — that is a misreading of D9.
- **Zero accounting changes.** Accounting buckets on `sales.status` (D18). Do not touch `src/api/accounting/**` or `src/db/accounting/**`.
- **No cache-key version bump.** The cached `Sale` payload's *runtime* shape is unchanged: `recipientId` and `Recipient` inside `Gift` were already populated for every gift the app created; only their TypeScript nullability moves. Do not add a `:v3`.
- Hexagonal split is mandatory: `src/api/**/*.service.ts` must never import Prisma or any ORM. Only `src/db/**` and `scripts/**` import Prisma.
- Explicit return types on every backend function and method, including `Promise<void>`.
- No single-letter locals (classic indexed-`for` `i`/`j`/`k` excepted). No inline `if` — always braced, body on its own line. Blank line before `if` / `for` / `while` / `return` / `throw` unless it is the first statement in its block.
- Constructor-injected dependencies are `private readonly`.
- Jest/Vitest structure: a `describe` per condition (`when …`), `it` titles state only the outcome, shared setup in that `describe`'s own `beforeEach`.
- Deps are exact-pinned; this plan adds no dependencies.
- Backend gate: `npm run lint -- --max-warnings 0`, `npm run typecheck`, `npm test`. Frontend gate: `cd web && npm run check && npm test`. Both must pass at the end of every task **except Task 1**, which deliberately leaves the backend typecheck red (see its note).
- **Do not commit.** Each task ends by *staging* its changes and reporting. The user runs `/crit` on the staged diff and gives the go-ahead before anything is committed. The `git add` lines below are deliberate; there are no `git commit` lines.

---

## Parallelism

**Two independent tracks. They can be built at the same time, by different agents, and they do not share a file.**

| Track | Tasks | Depends on |
|---|---|---|
| **Backend** | 1 → 2 → 3 → 4 → 5 → 6 → 7 (strictly sequential within the track) | nothing |
| **Frontend** | 8, 9 (independent of each other, either order) | nothing |

The two tracks meet only at runtime, and the contract between them is pinned here so neither has to wait:

- The draft-row field carrying the recipient is named **`recipient`** (string, optional) — on `RawImportRow`, on `DraftRowDto`, and on the web `DraftRow`. Same name as the CSV column, like every other draft field.
- The new row status string is exactly **`'error:gift-recipient-missing'`**.

Either side can ship first without breaking the other. The API's global `ValidationPipe` runs with `whitelist: true` and **not** `forbidNonWhitelisted`, so a `recipient` property arriving on a commit payload before the backend knows about it is silently stripped, not rejected. An end-to-end import with a recipient column only works once both tracks have landed.

---

## File Structure

**Modified — backend:**

| File | Responsibility after this change |
|---|---|
| `src/prisma/schema.prisma` | `Gifts.recipientId` / `Gifts.giftedAt` non-null; `Recipient` relation `onDelete: Restrict` |
| `src/prisma/migrations/20260911120100_add_recipients_and_gifts/migration.sql` | Same file, rewritten in place: `NOT NULL` on both columns, `ON DELETE RESTRICT` on the recipient FK |
| `src/db/sales/type/sale.type.ts` | `Gift.recipientId` and `Gift.Recipient` are non-null inside `Gift` |
| `src/db/sales/sales.db.interface.ts` | `updateGift` returns `{ recipientId: RecipientId }` |
| `src/db/sales/sales.service.ts` | `updateGift` reads the existing gift with `findUniqueOrThrow` and returns a non-null id |
| `src/db/sales/sales.service.spec.ts` | `updateGift`'s no-recipient case asserts the non-null return |
| `src/api/sales/sales.service.ts` | `resolveExistingGiftRecipient` loses its recipient-less branch |
| `src/api/sales/sales.service.spec.ts` | The "already GIFTED with no recipient" `describe` is deleted |
| `src/shared/utils/recipient-name.util.ts` *(new)* | `normalizeRecipientName`, shared by the manual flow and the import flow |
| `src/api/sales-import/sales-import.csv.ts` | `recipient` in `OPTIONAL_COLUMNS`; `recipient: string \| null` on `RawImportRow` |
| `src/api/sales-import/sales-import.csv.spec.ts` | Recipient-column parsing cases |
| `src/api/sales-import/dto/draft-row.dto.ts` | `recipient?: string`; `error:gift-recipient-missing` in `DRAFT_ROW_STATUSES` |
| `src/api/sales-import/sales-import.resolver.ts` | `resolveGiftRecipientStatus`, wired into both `resolveDraftRows` and `validateCommitRows` |
| `src/api/sales-import/sales-import.resolver.spec.ts` | Recipient-missing cases in both functions |
| `src/api/sales-import/sales-import.service.ts` | `commit` builds the `gift` payload; `giftedAt` falls back to the match's date |
| `src/api/sales-import/sales-import.service.spec.ts` | Fallback + passthrough cases; the "leaves giftedAt null" cases are deleted |
| `src/db/sales-import/sales-import.db.interface.ts` | `BulkSaleGiftInput`; `BulkSaleInput.gift` replaces `BulkSaleInput.giftedAt` |
| `src/db/sales-import/sales-import.service.ts` | `bulkCreate` injects `IRecipientsDbService` and resolves the recipient on its own `tx` |
| `src/db/sales-import/sales-import.service.spec.ts` | Fixtures move to `gift`; recipient-resolution assertions |
| `scripts/seed-demo.ts` | `addSale` takes `gift: { recipientId, giftedAt } \| null` instead of a nullable `recipientId` |

**Modified — frontend:**

| File | Responsibility after this change |
|---|---|
| `web/src/lib/types/sales-import.ts` | `recipient?: string` on `DraftRow`; `error:gift-recipient-missing` in `DraftRowStatus` |
| `web/src/lib/ui/ImportSalesDraft.svelte` | A Recipient column, editable per row |
| `web/src/lib/ui/ImportSalesModal.svelte` | Upload-screen column hint mentions `recipient` |
| `web/src/routes/(app)/sales/+page.svelte` | `hasRecipient` hidden input deleted; `required` collapses to one condition |
| `web/src/routes/(app)/sales/read-payload.ts` | `hasRecipient` read and its half of the gate deleted |
| `web/src/routes/(app)/sales/read-payload.spec.ts` | Two obsolete `describe`s deleted; `hasRecipient` drops out of the fixtures |

**Deliberately untouched:** `web/src/lib/types.ts` (`SaleDetail.Recipient` stays nullable — D9/D17), `web/src/routes/(app)/sales/[saleId]/**`, `src/redis/CACHE_KEYS.ts`, `src/api/recipients/**`, `src/db/recipients/**`, `src/api/sales/dto/update-sale.dto.ts`, `src/common/exceptions/**` (no new error code — `error:gift-recipient-missing` is a draft row status, not a `DomainException`), `src/api/accounting/**`, `src/db/accounting/**`, `src/api/ask/**`, `scripts/ungift-sale.ts`.

---

# Backend track

### Task 1: Schema and migration — make both columns `NOT NULL`

**Files:**
- Modify: `src/prisma/schema.prisma`
- Rewrite in place: `src/prisma/migrations/20260911120100_add_recipients_and_gifts/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: regenerated Prisma client types where `Gifts.recipientId` is `string`, `Gifts.giftedAt` is `Date`, and `Gifts.Recipient` is non-optional. Every later backend task depends on that regeneration.

> **Read first:** spec D14's `recipient_id` / `gifted_at` field notes, D19's 2026-09-15 addendum (why this file is edited rather than superseded).

- [ ] **Step 1: Start the local database**

```bash
npm run local:db:up
```

Expected: `psg-inventory-db` reports healthy within ~10s.

- [ ] **Step 2: Edit the `Gifts` model in `src/prisma/schema.prisma`**

Three field changes. Leave `saleId`, `saleStatus`, the `Sale` relation, `@@unique`, `@@index` and `@@map` exactly as they are.

```prisma
  recipientId String      @map("recipient_id")
  giftedAt    DateTime    @map("gifted_at")
  Recipient   Recipients  @relation(fields: [recipientId], references: [id], onDelete: Restrict)
```

Update the model's leading comment so the next reader is not told the columns are nullable. `onDelete: Restrict` deserves one line of its own: `SET NULL` is impossible against a non-null column and `CASCADE` would delete the gift, un-gifting its sale behind the composite foreign key's back.

- [ ] **Step 3: Rewrite the migration in place**

In `src/prisma/migrations/20260911120100_add_recipients_and_gifts/migration.sql`, inside the `CREATE TABLE "gifts"` block:

```sql
    "recipient_id" TEXT NOT NULL,
    "gifted_at" TIMESTAMP(3) NOT NULL,
```

and the recipient foreign key:

```sql
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
```

Nothing else in the file moves. Do not touch `20260911120000_add_gifted_sale_status`.

- [ ] **Step 4: Reset, regenerate, reseed**

```bash
npx prisma migrate reset --force
npx prisma generate
npm run local:db:seed
```

Expected: reset applies both migrations cleanly, generate succeeds, and the seed completes — the seed already gives every `GIFTED` sale a real recipient, so it must not hit a null violation. **If the seed fails on `recipient_id`, stop:** it means a seeded gift path was missed and Task 7 needs to move ahead of this step.

- [ ] **Step 5: Verify the constraints by hand**

Against the local database, confirm all four:

1. `INSERT INTO gifts (id, sale_id, sale_status, recipient_id, gifted_at, created_at, updated_at) VALUES (…, NULL, …)` → fails, `null value in column "recipient_id"`.
2. The same insert with `gifted_at` NULL → fails.
3. `DELETE FROM recipients WHERE id = '<a recipient with a gift>'` → fails, `violates foreign key constraint "gifts_recipient_id_fkey"`.
4. `DELETE FROM recipients WHERE id = '<a recipient with no gift>'` → succeeds.

`scripts/verify-gift-constraints.sql` already exists (it was created for the D15 constraint proof). **Append these four as new cases there** rather than running them ad hoc, and record the outputs in the task report.

- [ ] **Step 6: Stage**

```bash
npm run format
git add src/prisma/schema.prisma src/prisma/migrations
```

> **Expected red state.** `npm run typecheck` will now fail in `src/db/sales/**`, `src/db/sales-import/**`, `src/api/sales-import/**` and `scripts/seed-demo.ts`, because `recipientId` and `giftedAt` are no longer assignable from `null`. That is the correct state at the end of this task; Tasks 2–7 clear it. **Report the exact failing file list** — it is the checklist for the rest of the track.

---

### Task 2: Sales read/write path — drop the recipient-less branch

**Files:**
- Modify: `src/db/sales/type/sale.type.ts`, `src/db/sales/sales.db.interface.ts`, `src/db/sales/sales.service.ts`, `src/db/sales/sales.service.spec.ts`, `src/api/sales/sales.service.ts`, `src/api/sales/sales.service.spec.ts`

**Interfaces:**
- Consumes: the regenerated client from Task 1.
- Produces: `ISalesDbService.updateGift` returning `Promise<{ recipientId: RecipientId }>`; a `Sale` whose `Gift`, when present, has a non-null `recipientId` and a non-null `Recipient`.

> **Read first:** spec D9. Note what does **not** change: `SaleResponse.Recipient` and `SaleResponse.giftedAt` stay nullable, because `flattenGift` still has to answer for a sale with no gift row at all.

- [ ] **Step 1: Write the failing test for `updateGift`'s non-null return**

In `src/db/sales/sales.service.spec.ts`, under `describe('updateGift')` → `describe('when no recipient is given')`, change the existing test to mock `tx.gifts.findUniqueOrThrow` (not `findUnique`) and assert the method resolves to `{ recipientId: 'recipient-1' }` with no `| null` in sight.

Expected: FAIL — `findUniqueOrThrow` was never called.

- [ ] **Step 2: Narrow the interface**

`src/db/sales/sales.db.interface.ts`: `updateGift` returns `Promise<{ recipientId: RecipientId }>`. Update its doc comment — the "assumes the gift row exists" paragraph is still true and still worth keeping, but it should now say that the no-recipient read uses `findUniqueOrThrow`, so a bypassed-write-path row raises P2025 from *both* branches rather than silently returning `null` from one.

- [ ] **Step 3: Implement**

In `src/db/sales/sales.service.ts`'s `updateGift`, the `payload.recipient == null` branch becomes:

```ts
const existingGift = await tx.gifts.findUniqueOrThrow({
    where: { saleId: payload.saleId },
    select: { recipientId: true },
});

return existingGift.recipientId as RecipientId;
```

and the other branch drops its `as RecipientId | null` cast. `giftSale` and `ungiftSale` are unchanged.

Expected: PASS.

- [ ] **Step 4: Tighten `sale.type.ts`**

In the `Gift` override, `recipientId` becomes `RecipientId` and the `Recipient` override drops its `| null`. The `Gift: … | null` at the outer level **stays** — a non-gifted sale has no gift row.

- [ ] **Step 5: Delete the obsolete api-layer test**

In `src/api/sales/sales.service.spec.ts`, delete the whole `describe('when the sale is already GIFTED but has no recipient (e.g. a CSV-imported gift) and no recipient is supplied')` block and both of its `it`s. Fix any fixture in the file that builds a `Gift` with `recipientId: null` or `Recipient: null` — those objects no longer typecheck.

Expected: the remaining suite still passes; the deleted cases are gone, not skipped.

- [ ] **Step 6: Delete the branch it covered**

In `src/api/sales/sales.service.ts`, `resolveExistingGiftRecipient` collapses to: `recipientId` given → assert ownership and use it; name blank after normalizing → `undefined` (keep the current recipient); otherwise the name. The `if (existing.Gift?.recipientId != null)` test and the `SALE_GIFT_RECIPIENT_REQUIRED` throw inside it both go. The `existing` parameter becomes unused — **remove it from the signature and the call site**, don't leave a dangling argument.

Rewrite the method's comment to state the new rule in one sentence: on an already-`GIFTED` sale a blank name can only mean "keep the current recipient", because every gift has one.

- [ ] **Step 7: Verify and stage**

```bash
npm run lint -- --max-warnings 0 && npm run typecheck && npm test
```

`typecheck` is still expected to fail — but only in `src/db/sales-import/**`, `src/api/sales-import/**` and `scripts/seed-demo.ts` now. `src/db/sales/**` and `src/api/sales/**` must be clean.

```bash
npm run format
git add src/db/sales src/api/sales
```

---

### Task 3: CSV parser — an optional `recipient` column

**Files:**
- Modify: `src/api/sales-import/sales-import.csv.ts`, `src/api/sales-import/sales-import.csv.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure function — this task could run first if the track were reordered).
- Produces: `RawImportRow.recipient: string | null`.

> **Read first:** spec D10, the first two bullets. The header is optional; the *value* is required per `GIFTED` row, and that requirement is enforced in Task 4, not here. The parser stays a parser.

- [ ] **Step 1: Write the failing tests**

In `src/api/sales-import/sales-import.csv.spec.ts`, add a `describe('recipient column')` with four `it`s:

- parses a `recipient` value onto the row
- yields `null` for a blank `recipient` cell
- yields `null` for every row when the header is absent
- does not report `recipient` as an unknown column

Expected: FAIL — `recipient` is rejected as `unknown-column` in the first, second and fourth; `row.recipient` is `undefined` in the third.

- [ ] **Step 2: Implement**

- `OPTIONAL_COLUMNS` gains `'recipient'`.
- `RawImportRow` gains `recipient: string | null`.
- The row build gains `recipient: parseOptionalCell(raw.recipient, (value) => value)` — `parseOptionalCell` already trims and already maps a whitespace-only cell to `null`, which is exactly the "missing" the resolver will test for.
- Replace the stale file-header comment (`there is no recipient column: imported gifts land with recipientId null…`) with the new rule: the column is optional in the header and required per `GIFTED` row, enforced in the resolver.

Expected: PASS.

- [ ] **Step 3: Verify and stage**

```bash
npm test -- sales-import.csv
npm run format
git add src/api/sales-import/sales-import.csv.ts src/api/sales-import/sales-import.csv.spec.ts
```

---

### Task 4: Resolver — `error:gift-recipient-missing`

**Files:**
- Create: `src/shared/utils/recipient-name.util.ts`
- Modify: `src/api/sales-import/dto/draft-row.dto.ts`, `src/api/sales-import/sales-import.resolver.ts`, `src/api/sales-import/sales-import.resolver.spec.ts`, `src/api/sales/sales.service.ts`

**Interfaces:**
- Consumes: `RawImportRow.recipient` from Task 3.
- Produces: `'error:gift-recipient-missing'` in `DRAFT_ROW_STATUSES`; `DraftRowDto.recipient?: string`; an exported `normalizeRecipientName`.

> **Read first:** spec D10, bullets 2 and 3 — a **row** error, not a file error, and a non-`GIFTED` row's recipient value is ignored rather than rejected.

- [ ] **Step 1: Extract `normalizeRecipientName` into a shared util**

Move the module-private `normalizeRecipientName` from the bottom of `src/api/sales/sales.service.ts` into `src/shared/utils/recipient-name.util.ts` and import it back. Trim plus internal-whitespace collapse, unchanged behaviour, explicit return type. The import flow needs the same normalization in Task 5 and two copies of this rule is how "Marc" and "Marc " become two recipients.

Expected: the whole existing suite still passes — this step changes no behaviour.

- [ ] **Step 2: Write the failing resolver tests**

In `src/api/sales-import/sales-import.resolver.spec.ts`, add `describe('gift recipient requirement')` under `resolveDraftRows` with a `describe` per condition:

- when the row is `GIFTED` with no `recipient` → `rowStatus` is `error:gift-recipient-missing`
- when the row is `GIFTED` with a whitespace-only `recipient` → same
- when the row is `GIFTED` with a `recipient` → `ok`
- when the row is `SOLD` with a `recipient` → `ok` (the value is ignored, not an error)

Then mirror all four against `validateCommitRows`, in its own `describe`. That mirror is not redundancy for its own sake: `validateCommitRows` is the only thing standing between a hand-edited commit payload and a null insert.

Expected: FAIL — every recipient-missing case reports `ok`.

- [ ] **Step 3: Add the status and the DTO field**

- `DRAFT_ROW_STATUSES` gains `'error:gift-recipient-missing'`.
- `DraftRowDto` gains `@IsOptional() @IsString() recipient?: string;`.

- [ ] **Step 4: Implement the check in both functions**

Add a small pure helper next to `resolveSoldAtStatus`:

```ts
function resolveGiftRecipientStatus(raw: {
    status: SaleRowStatus;
    recipient: string | null;
}): DraftRowStatus | null {
    if (raw.status !== 'GIFTED') {
        return null;
    }

    return (raw.recipient ?? '').trim().length === 0
        ? 'error:gift-recipient-missing'
        : null;
}
```

Wire it into the error-precedence chain of **both** `resolveDraftRows` and `validateCommitRows`, in the same position in each: **after** the match and allocation errors, **before** the `soldAt` kickoff check. Rationale to put in the comment: match and allocation errors are structural (the row maps to nothing), recipient and kickoff are value-level, and a row that trips both must report the same one every time — the order is arbitrary but it must be deterministic and identical in the two functions, or a preview and its commit will disagree.

Both functions must also carry `recipient` through onto the emitted `DraftRowDto`, alongside the existing conditional-spread treatment of `soldAt`, in all three push sites (the `isInvalidRow` early-exit, the main `resolveDraftRows` push, and the `validateCommitRows` push). `validateCommitRows` must read `recipient` off the incoming row into its local `raw` object too — otherwise a valid draft is re-validated as recipient-less.

Expected: PASS.

- [ ] **Step 5: Verify and stage**

```bash
npm test -- sales-import.resolver sales.service
npm run format
git add src/shared/utils/recipient-name.util.ts src/api/sales-import src/api/sales/sales.service.ts
```

---

### Task 5: Import api service — build the gift payload, fall back to the match date

**Files:**
- Modify: `src/db/sales-import/sales-import.db.interface.ts`, `src/api/sales-import/sales-import.service.ts`, `src/api/sales-import/sales-import.service.spec.ts`

**Interfaces:**
- Consumes: `DraftRowDto.recipient` and `error:gift-recipient-missing` from Task 4.
- Produces: `BulkSaleGiftInput` and `BulkSaleInput.gift`, replacing `BulkSaleInput.giftedAt`.

> **Read first:** spec D10, the `gifted_at` paragraph. The fallback is always available because a row without a resolved match is `error:match-missing` and never reaches the writer.

- [ ] **Step 1: Change the db interface's input shape**

In `src/db/sales-import/sales-import.db.interface.ts`:

```ts
// Non-null exactly when `status` is GIFTED. One object rather than two
// nullable siblings, so "a gift has both a recipient and a date, or there is
// no gift" is a fact the type states instead of a fact the writer remembers.
export type BulkSaleGiftInput = {
    recipientName: string;
    giftedAt: Date;
};
```

`BulkSaleInput` drops `giftedAt: Date | null` and gains `gift: BulkSaleGiftInput | null`. `soldAt: Date | null` stays exactly as it is.

- [ ] **Step 2: Write the failing tests**

In `src/api/sales-import/sales-import.service.spec.ts`, under `describe('commit')`:

- **Delete** `describe('when the row is not SOLD') → it('leaves giftedAt null, even if provided')` — the whole `giftedAt` half of that block. Replace it with an `it` asserting `gift: null` for a non-`GIFTED` row. Keep the `soldAt` nulling case untouched.
- Rewrite `describe('when the row is GIFTED')`:
  - when the row carries a date → `gift.giftedAt` is that date at noon UTC, and `gift.recipientName` is the row's recipient
  - when the row carries **no** date → `gift.giftedAt` is **the match's date**, never `null`
  - when the row's recipient has ragged whitespace → `gift.recipientName` is normalized (trimmed, internal runs collapsed)

Expected: FAIL — `bulkCreate` still receives a flat `giftedAt`.

- [ ] **Step 3: Implement**

In `commit`, before the `validated.rows.map`, index the matches already in scope:

```ts
const matchDates = new Map(homeMatches.map((match) => [match.id, match.date]));
```

Then, per row, `gift` is `null` unless `row.status === 'GIFTED'`, in which case:

- `recipientName = normalizeRecipientName(row.recipient ?? '')`
- `giftedAt = row.soldAt != null ? dateOnlyToUtcNoon(row.soldAt) : matchDates.get(row.matchId!)`

If either comes out empty/undefined, throw `DomainException(ErrorCode.IMPORT_ROWS_INVALID)`. `validateCommitRows` has already guaranteed both — the throw is what lets the code be non-null without a `!` on the values that actually reach the database, and it fails loudly rather than inserting a null.

Drop the old top-level `giftedAt` field from the mapped object.

Expected: PASS.

- [ ] **Step 4: Verify and stage**

```bash
npm test -- sales-import.service
npm run format
git add src/db/sales-import/sales-import.db.interface.ts src/api/sales-import/sales-import.service.ts src/api/sales-import/sales-import.service.spec.ts
```

`npm run typecheck` still fails in `src/db/sales-import/sales-import.service.ts` and `scripts/seed-demo.ts` only.

---

### Task 6: Import db service — resolve the recipient inside the transaction

**Files:**
- Modify: `src/db/sales-import/sales-import.service.ts`, `src/db/sales-import/sales-import.service.spec.ts`

**Interfaces:**
- Consumes: `BulkSaleInput.gift` from Task 5.
- Produces: gift rows with a non-null `recipient_id` and `gifted_at`.

> **Read first:** spec D10, the "no batch pass" paragraph, and `src/db/sales/sales.service.ts`'s `resolveRecipientId` — this is the same call on the same kind of `tx`, and `src/db/recipients/recipients.db.interface.ts` documents why the `tx` argument matters.

- [ ] **Step 1: Write the failing tests**

In `src/db/sales-import/sales-import.service.spec.ts`:

- Add `IRecipientsDbService` to the testing module as a `mockDeep` provider, and update `baseSaleInput` / `giftedSaleInput` to the `gift` shape (`gift: null` for the base, `gift: { recipientName: 'Marc', giftedAt: new Date(…) }` for the gifted one).
- `describe('when a committed row is GIFTED')`: resolves the recipient via `findOrCreateForUser` **on the transaction client** (assert the third argument is the same `tx` object the sale was created on), and creates the gift row with that resolved id and the payload's `giftedAt`.
- `describe('when a committed row is SOLD')`: creates no gift row **and** never calls `findOrCreateForUser`.

Expected: FAIL — `findOrCreateForUser` was never called; `tx.gifts.create` receives no `recipientId`.

- [ ] **Step 2: Implement**

Inject `private readonly recipientsDbService: IRecipientsDbService` into `SalesImportService`'s constructor (the db-layer one). Precedent: `src/db/sales/sales.service.ts` already injects it, and `DbModule` already provides it — no module change is needed; confirm that before assuming it.

Inside the existing `$transaction` loop, replace the `sale.status === SaleStatus.GIFTED` block with a `sale.gift != null` block that resolves the recipient on `tx` and then creates the gift row with the resolved id and `sale.gift.giftedAt`. Rewrite the comment above it — the old one says an imported gift arrives with no recipient by construction, which is now exactly backwards.

Expected: PASS.

- [ ] **Step 3: Verify and stage**

```bash
npm test -- sales-import
npm run format
git add src/db/sales-import
```

---

### Task 7: Seed script and full backend verification

**Files:**
- Modify: `scripts/seed-demo.ts`

**Interfaces:**
- Consumes: the regenerated client from Task 1.
- Produces: a green backend.

- [ ] **Step 1: Tighten the seed's gift parameter**

`addSale`'s `recipientId: string | null` becomes `gift: { recipientId: string; giftedAt: Date } | null`, and the `if (params.status === SaleStatus.GIFTED)` block becomes `if (params.gift != null)` — same restructuring as `BulkSaleInput`, same reason. Update all three call sites: the current-season loop passes a gift object for `GIFTED` plans and `null` otherwise; the other two pass `null`.

- [ ] **Step 2: Reset and reseed against the real database**

```bash
npm run local:db:up
npx prisma migrate reset --force
npm run local:db:seed
```

Expected: no null-violation, no FK error. Then confirm in psql that `SELECT count(*) FROM gifts WHERE recipient_id IS NULL OR gifted_at IS NULL` returns `0` — which it must, since the columns are `NOT NULL`; the point is that the seed produced gifts at all rather than silently seeding none.

- [ ] **Step 3: Full backend gate**

```bash
npm run lint -- --max-warnings 0
npm run typecheck
npm test
```

All three green. `typecheck` in particular must now be clean — if anything from Task 1's reported failing-file list is still red, that file was missed.

- [ ] **Step 4: Grep for stragglers**

```bash
grep -rn "giftedAt: null\|recipientId: null\|recipient_id is null\|no recipient" src scripts
```

Expected: no hits that assert or construct a recipient-less gift. Comments describing the *old* rule are bugs in documentation — fix them.

- [ ] **Step 5: Stage**

```bash
npm run format
git add scripts/seed-demo.ts
```

---

# Frontend track

### Task 8: Import draft grid — surface the recipient column

**Files:**
- Modify: `web/src/lib/types/sales-import.ts`, `web/src/lib/ui/ImportSalesDraft.svelte`, `web/src/lib/ui/ImportSalesModal.svelte`

**Interfaces:**
- Consumes: the pinned contract in *Parallelism* — field `recipient`, status string `'error:gift-recipient-missing'`. **Do not** wait on the backend track.
- Produces: a draft row that carries a recipient and an error the user can fix in place.

> **Read first:** spec D10 and the frontend half of *Scope of change*. Note that `web/src/lib/types/sales-import.ts` hand-mirrors the backend unions rather than importing them — that is why these two tracks can run in parallel, and it is also why the two strings above must be typed exactly.

- [ ] **Step 1: Extend the types**

In `web/src/lib/types/sales-import.ts`: `DraftRowStatus` gains `| 'error:gift-recipient-missing'`; `DraftRow` gains `recipient?: string` (next to `soldAt?`).

- [ ] **Step 2: Add the column to the grid**

In `web/src/lib/ui/ImportSalesDraft.svelte`:

- A `<th class="p-2">Recipient</th>` between `Sale status` and `Sold at`.
- A matching `<td>` with a text input bound the way every other cell is: `value={row.recipient ?? ''}`, `onchange` calling `updateRow(index, { recipient: … || undefined })`, `disabled={row.status !== 'GIFTED'}`, and the same `disabled:opacity-50` class the `Sold at` input already uses. Width in the ballpark of the opponent input (`w-28`).
- No new status-label map is needed: the grid renders `row.rowStatus` as raw text and colours it by the `error:` / `warn:` prefix, so the new status displays and colours correctly with no change.

- [ ] **Step 3: Update the upload hint**

In `web/src/lib/ui/ImportSalesModal.svelte`, the column list becomes `date, opponent, listedPrice, nbTickets, status, invest, soldAt, recipient` and the parenthetical becomes something like *(invest, soldAt, recipient optional — soldAt only applies to SOLD rows; recipient is required on GIFTED rows)*.

- [ ] **Step 4: Verify and stage**

```bash
cd web && npm run check && npm test
```

Expected: green. There is no unit test for this component; the check is type-level plus a manual pass — upload a CSV with a `recipient` column in `npm run dev` **once the backend track has landed**, and confirm the column renders, is editable on a `GIFTED` row, and is disabled elsewhere. If the backend has not landed, say so in the report and leave the manual check for the integration pass.

```bash
git add web/src/lib/types/sales-import.ts web/src/lib/ui/ImportSalesDraft.svelte web/src/lib/ui/ImportSalesModal.svelte
```

---

### Task 9: Delete `hasRecipient`

**Files:**
- Modify: `web/src/routes/(app)/sales/+page.svelte`, `web/src/routes/(app)/sales/read-payload.ts`, `web/src/routes/(app)/sales/read-payload.spec.ts`

**Interfaces:**
- Consumes: nothing. Independent of Task 8 and of the entire backend track — it only *removes* a client-side check whose server-side counterpart disappears in backend Task 2, and in the window between the two the server is simply stricter than the client, which is the safe direction.
- Produces: a gift form with one `required` condition instead of two.

> **Read first:** spec D9, the paragraph naming the three deletion sites, and the *Recipient combobox* section's new `required` bullet.

- [ ] **Step 1: Delete the obsolete tests first**

In `web/src/routes/(app)/sales/read-payload.spec.ts`:

- **Delete** `describe('when the sale is already GIFTED with no recipient (CSV import) and the name is blank')` and `describe('when the sale is already GIFTED with no recipient (CSV import) and a name is supplied')`, with all their `it`s. The state they describe cannot occur.
- Remove `hasRecipient` from the `giftForm` fixture helper and from every remaining call site.
- Keep, and re-read: entry into `GIFTED` with no name (rejected), entry with a name (accepted and forwarded), already-`GIFTED` with a blank name (accepted, keeps the current recipient), and both edit-numbers-form cases. The explanatory comment on the already-`GIFTED` edit-numbers case mentions `hasRecipient` — rewrite it rather than deleting it; what it warns against (inferring intent from which fields happen to be present) is still the point.

Expected: FAIL — `readPayload` still reads a field the fixtures no longer supply, so the "already GIFTED with a blank name" case now errors instead of passing.

- [ ] **Step 2: Simplify the gate**

In `web/src/routes/(app)/sales/read-payload.ts`, delete the `hasRecipient` line and reduce the condition to:

```ts
if (previousStatusRaw !== 'GIFTED' && recipientName.length === 0) {
    return { error: 'Gift recipient is required.' };
}
```

Update the block comment: a name is required only on a genuine entry into `GIFTED`, because an already-`GIFTED` sale always has a recipient to fall back to (spec D9). The `intent === 'gift'` gate stays exactly as it is — it is what separates this form from the edit-numbers form, and that is unrelated to this change.

Expected: PASS.

- [ ] **Step 3: Delete the hidden input and the second `required` arm**

In `web/src/routes/(app)/sales/+page.svelte`:

- Delete the `<input type="hidden" name="hasRecipient" … />` element entirely.
- `required={editSale.status !== 'GIFTED' || editSale.Recipient == null}` becomes `required={editSale.status !== 'GIFTED'}`.
- Leave `previousStatus` alone — the server still needs it.
- The helper text below the button has a three-way `{#if}` whose middle arm (`{:else if editSale.status === 'GIFTED'}` → "Gift recipient is required.") is now unreachable: an already-`GIFTED` sale always has a `Recipient`. Collapse it to two arms — gifted (leave blank to keep the current recipient) and not-gifted (the two explanatory lines).
- `editSale.Recipient?.name ?? '—'` and the `?? 'Name'` placeholder fallback **stay**: `SaleDetail.Recipient` is still typed nullable (D9/D17), so the optional chaining is still required to compile.

- [ ] **Step 4: Verify and stage**

```bash
cd web && npm run check && npm test
grep -rn "hasRecipient" web/src
```

Expected: check and tests green; the grep returns nothing.

```bash
git add "web/src/routes/(app)/sales/+page.svelte" "web/src/routes/(app)/sales/read-payload.ts" "web/src/routes/(app)/sales/read-payload.spec.ts"
```

---

## Test files touched, at a glance

| File | Cases added | Cases deleted |
|---|---|---|
| `src/db/sales/sales.service.spec.ts` | — (one existing case rewritten for `findUniqueOrThrow`) | — |
| `src/api/sales/sales.service.spec.ts` | — | `describe('when the sale is already GIFTED but has no recipient (e.g. a CSV-imported gift)…')`, both `it`s |
| `src/api/sales-import/sales-import.csv.spec.ts` | 4 (recipient column parsing) | — |
| `src/api/sales-import/sales-import.resolver.spec.ts` | 8 (4 in `resolveDraftRows`, 4 mirrored in `validateCommitRows`) | — |
| `src/api/sales-import/sales-import.service.spec.ts` | 3 (`gift` payload, match-date fallback, name normalization) | `it('leaves giftedAt null')` and the `giftedAt`-null half of the not-SOLD block |
| `src/db/sales-import/sales-import.service.spec.ts` | 2 (recipient resolved on `tx`; no resolution for a SOLD row) | — (fixtures rewritten to the `gift` shape) |
| `web/src/routes/(app)/sales/read-payload.spec.ts` | — | 2 `describe`s (both "already GIFTED with no recipient (CSV import)" cases) |

No new test file is created. `src/db/recipients/recipients.service.spec.ts` and `src/api/recipients/recipients.service.spec.ts` are unaffected — `giftCount` is an unfiltered `_count` on `Gifts` and does not care about nullability.

## Final integration pass (after both tracks land)

- [ ] `npm run lint -- --max-warnings 0 && npm run typecheck && npm test` at the repo root.
- [ ] `cd web && npm run check && npm test`.
- [ ] Manual: import a CSV containing one `GIFTED` row with a `recipient`, one `GIFTED` row without, and two ordinary rows. Confirm the preview flags exactly the recipient-less row as `error:gift-recipient-missing`, that typing a name in the grid clears it, that commit is refused while it stands, and that after commit the gifted sale shows its recipient and a `giftedAt` equal to the match date when the CSV supplied none.
- [ ] Manual: on an existing gifted sale, submit the gift form with the recipient field blank and confirm the recipient is unchanged (not cleared, not an error).
