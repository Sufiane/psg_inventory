# Remove GIFTED Back-Compat Scaffolding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the compatibility scaffolding the GIFTED sale-status feature shipped with — the deprecated `sold` alias, the `:v2` cache-key suffixes, the `flattenGift()` wire shim, and the optional/defensive gift handling in `web/` — now that the feature is merged, deployed, and migrated in production.

**Architecture:** This is a deletion, not a feature. Six tasks in three groups. Tasks 1–3 touch the backend without changing the wire shape. Task 4 changes it: `flattenGift()` dies and the sale's `Gift` row goes out on the wire nested, exactly as it is stored. Task 5 is the frontend consuming that new shape and is **strictly downstream of Task 4**. Task 6 is a comment-only frontend change that depends on nothing.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 + Redis (`src/`), Jest + `jest-mock-extended` for backend unit tests. SvelteKit 2 + Svelte 5 + Vitest (`web/`).

**Spec:** `docs/specs/2026-09-15-remove-gifted-backcompat-design.md` — read D1–D5 before starting. The behavioural spec of record for the feature itself is `docs/specs/2026-09-11-gifted-sale-status-design.md`; this plan changes none of that behaviour.

## Global Constraints

- **No database migration.** `gifts.recipient_id` and `gifts.gifted_at` are already `NOT NULL` in the shipped migration `20260911120100_add_recipients_and_gifts`. If a task appears to need an `ALTER TABLE`, stop and escalate — it is a misreading.
- **No production cache flush step.** Per spec D1, the cache is assumed effectively empty and a rollback of the GIFTED feature is ruled out. Do not add a runbook, a script, or a startup-time purge.
- **No behaviour changes** beyond the wire-shape change in Task 4. No new endpoints, no new fields, no new validation.
- Hexagonal split is mandatory: `src/api/**/*.service.ts` must never import Prisma or any ORM. Only `src/db/**` and `scripts/**` import Prisma.
- Explicit return types on every backend function and method, including `Promise<void>`.
- No single-letter locals (classic indexed-`for` `i`/`j`/`k` excepted). No inline `if` — always braced, body on its own line. Blank line before `if` / `for` / `while` / `return` / `throw` unless it is the first statement in its block.
- Constructor-injected dependencies stay `private readonly`.
- Comments default to none. This plan deletes more comments than it writes; where it writes one, keep it to the load-bearing why in one or two lines.
- Jest/Vitest structure: a `describe` per condition (`when …`), `it` titles state only the outcome, shared setup in that `describe`'s own `beforeEach`.
- Deps are exact-pinned; this plan adds and removes no dependencies.
- Backend gate: `npm run lint -- --max-warnings 0`, `npm run typecheck`, `npm test`. Frontend gate: `cd web && npm run check && npm test`. The relevant gate must pass at the end of every task.
- **Do not commit.** Each task ends by *staging* its changes and reporting. The user runs `/crit` on the staged diff and gives the go-ahead before anything is committed. The `git add` lines below are deliberate; there are no `git commit` lines.

---

## Parallelism

**Two tracks, and they are NOT independent.**

| Track | Tasks | Depends on |
|---|---|---|
| **Backend** | 1, 2, 3, 4 — 2 and 3 touch the same file, so run 1 → 2 → 3 → 4 in order | nothing |
| **Frontend** | 5 | **Task 4** (consumes its new nested wire shape) |
| **Frontend** | 6 | nothing — may run at any time, including first |

Task 5 cannot start before Task 4 lands: it rewrites `web/` to read `sale.Gift.Recipient`, a shape the API only starts sending in Task 4. Dispatch the backend track first, then the frontend track. Task 6 is comment-only and can be slotted anywhere.

The contract between the tracks, pinned here so Task 5's implementer does not have to read Task 4's diff:

```ts
// What GET /sales/:id and the list endpoints send for each sale after Task 4
Gift: { giftedAt: string; recipientId: string; Recipient: { id: string; name: string } } | null
```

`Gift` is always present on the JSON object and is `null` for a non-gifted sale. When `Gift` is non-null, `Recipient` inside it is **never** null — `gifts.recipient_id` is `NOT NULL` in the database.

---

## File Structure

**Modified — backend:**

| File | Responsibility after this change |
|---|---|
| `src/redis/CACHE_KEYS.ts` | Four sale/accounting keys spelled without `:v2` |
| `src/redis/CACHE_KEYS.spec.ts` | Also proves `invalidateSales`'s pattern covers the keys `sales` / `salesByRange` write under |
| `src/api/sales/dto/update-sale.dto.ts` | `status` is the only status input; no `sold` |
| `src/api/sales/sales.service.ts` | Reads `payload.status` directly; no `flattenGift`; comments carry only load-bearing why |
| `src/api/sales/interfaces/sales.service.interface.ts` | `FormattedSale` derives from `Sale`; no `SaleResponse` |
| `src/api/sales/sales.service.spec.ts` | No `sold`-alias cases; read tests assert the nested gift |
| `src/db/sales/sales.query.ts` | Comment no longer claims the api flattens `Gift` |

**Modified — frontend:**

| File | Responsibility after this change |
|---|---|
| `web/src/lib/types.ts` | `SaleGift`; `Gift: SaleGift \| null` on `SaleListItem` / `SaleDetail`; no dead `UpdateSalePayload` |
| `web/src/routes/(app)/sales/[saleId]/+page.svelte` | Recipient row gated on `sale.Gift` |
| `web/src/routes/(app)/sales/+page.svelte` | Edit-drawer gift block gated on `editSale.Gift` |
| `web/src/routes/(app)/sales/read-payload.ts` | Docstring states the rule, not its history |
| `web/src/routes/(app)/sales/[saleId]/read-payload.ts` | Same |

**Created:** none. **Deleted:** none (no file disappears; code inside them does).

---

### Task 1: Cache keys lose `:v2`

**Files:**
- Modify: `src/redis/CACHE_KEYS.ts:11-40`
- Test: `src/redis/CACHE_KEYS.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CACHE_KEYS.sale(saleId)` → `` `sale:id:${saleId}` ``, `CACHE_KEYS.sales(userId)` → `` `user:id:${userId}:sales` ``, `CACHE_KEYS.salesByRange(userId, from, to)` → `` `user:id:${userId}:sales:start:${from}:end:${to}` ``, `CACHE_KEYS.accounting(userId, start, end)` → `` `accounting:user:id:${userId}:start:${start}:end:${end}` ``. All four signatures and return types are unchanged — only the literal changes.

- [ ] **Step 1: Write the failing test**

Append this `describe` to `src/redis/CACHE_KEYS.spec.ts`, inside the top-level `describe('CACHE_KEYS', ...)`, after the existing `describe('match', ...)`:

```ts
    describe('invalidateSales', () => {
        it('produces a pattern that covers the key the sales list is cached under', () => {
            const key = CACHE_KEYS.sales('user-id');
            const prefix = CACHE_KEYS.invalidateSales('user-id').replace('*', '');

            expect(key.startsWith(prefix)).toBe(true);
        });

        it('produces a pattern that covers the key a ranged sales query is cached under', () => {
            const key = CACHE_KEYS.salesByRange(
                'user-id',
                new Date('2025-08-01T00:00:00.000Z'),
                new Date('2026-08-01T00:00:00.000Z'),
            );
            const prefix = CACHE_KEYS.invalidateSales('user-id').replace('*', '');

            expect(key.startsWith(prefix)).toBe(true);
        });
    });
```

This test passes both before and after the key change — that is the point. It is the guard that the un-versioned keys stay inside the namespace the invalidation pattern sweeps. Do not write an assertion on the literal key string: the spec deliberately does not pin key spellings, and a string-equality test here would have to be edited by every future version bump, which is exactly the kind of test that gets updated without being read.

- [ ] **Step 2: Run it to confirm it passes against the current `:v2` keys**

Run: `npx jest src/redis/CACHE_KEYS.spec.ts`
Expected: PASS (4 tests). If it fails now, the invalidation pattern is already broken and that is a separate bug — stop and report.

- [ ] **Step 3: Drop `:v2` from the four keys**

In `src/redis/CACHE_KEYS.ts`, replace the `accounting` entry:

```ts
    accounting: (
        userId: string,
        start: Date,
        end?: Date,
    ): CacheKey<TimePeriodAccounting> =>
        `accounting:user:id:${userId}:start:${start.toISOString()}:end:${end?.toISOString()}` as CacheKey<TimePeriodAccounting>,
```

and replace the three-line comment plus the `sale` / `sales` / `salesByRange` entries (the comment block starting `// :v2 — the cached payload is the db-layer `Sale`…` goes away entirely):

```ts
    sale: (saleId: string): CacheKey<Sale> => `sale:id:${saleId}` as CacheKey<Sale>,
    sales: (userId: string): CacheKey<Sale[]> =>
        `user:id:${userId}:sales` as CacheKey<Sale[]>,
    salesByRange: (userId: string, from: Date, to: Date): CacheKey<Sale[]> =>
        `user:id:${userId}:sales:start:${from.toISOString()}:end:${to.toISOString()}` as CacheKey<
            Sale[]
        >,
```

Leave every other key untouched — `amortization`, `askRateLimit`, `matches`, `recipients`, the `invalidate*` patterns and the auth keys never carried a version.

- [ ] **Step 4: Confirm no `:v2` remains and the suite is green**

Run: `grep -rn "v2" src/redis/`
Expected: no output.

Run: `npm run lint -- --max-warnings 0 && npm run typecheck && npm test`
Expected: all green. The new `invalidateSales` tests still pass — the un-versioned keys sit under the same prefix.

- [ ] **Step 5: Stage**

```bash
git add src/redis/CACHE_KEYS.ts src/redis/CACHE_KEYS.spec.ts
```

Report: "Task 1 staged — cache keys un-versioned, invalidation-coverage test added. Not committed."

---

### Task 2: Delete the deprecated `sold` alias

**Files:**
- Modify: `src/api/sales/dto/update-sale.dto.ts`
- Modify: `src/api/sales/sales.service.ts:117`, `:373-385`
- Test: `src/api/sales/sales.service.spec.ts:720-752`

**Interfaces:**
- Consumes: nothing.
- Produces: `UpdateSaleDto` no longer has a `sold` property. `SaleStatusTarget` (`'PENDING' | 'SOLD' | 'GIFTED'`) and the optional `status` property are unchanged and stay exported.

- [ ] **Step 1: Delete the two tests that exercise the alias**

In `src/api/sales/sales.service.spec.ts`, delete these two `describe` blocks whole (they sit at the end of `describe('updateSale status transitions', ...)`), and nothing else:

```ts
        describe('when only the deprecated sold flag is sent', () => {
            it('still maps to SOLD', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await service.updateSale(userId, { saleId, sold: true } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'SOLD' }),
                );
            });
        });

        describe('when both status and the deprecated sold flag are sent', () => {
            it('lets status win', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000)),
                );

                await service.updateSale(userId, {
                    saleId,
                    sold: true,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                // Reachable only because target resolved to GIFTED, not SOLD —
                // that is what proves status won over the deprecated alias.
                expect(salesDbService.giftSale).toHaveBeenCalled();
                expect(salesDbService.updateSale).not.toHaveBeenCalled();
            });
        });
```

Keep the multi-line `// GIFTED -> PENDING used to be a legal exit…` comment that precedes them — it explains an absent test elsewhere in the file and is unrelated.

- [ ] **Step 2: Run the suite to confirm nothing else depended on those cases**

Run: `npx jest src/api/sales/sales.service.spec.ts`
Expected: PASS, with two fewer tests. Deleting a test never makes a suite fail; this step is confirming you deleted only what you meant to.

- [ ] **Step 3: Remove `sold` from the DTO**

`src/api/sales/dto/update-sale.dto.ts` in full after the edit:

```ts
import { PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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

    @IsOptional()
    @IsUUID()
    recipientId?: RecipientId;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    recipientName?: string;
}
```

Note `IsBoolean` is gone from the import list — it had no other user in this file.

- [ ] **Step 4: Delete `resolveTargetStatus` and read `status` directly**

In `src/api/sales/sales.service.ts`, delete this whole function and the comment above it (near the bottom of the file, between `flattenGift` and `LEGAL_TRANSITIONS`):

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
```

Then in `updateSale`, replace its one call site:

```ts
        const target = resolveTargetStatus(payload);
```

with:

```ts
        const target = payload.status;
```

`payload.status` is already `SaleStatusTarget | undefined`, so every downstream use (`assertLegalTransition`, `assertNotAfterKickoff`, the three routing branches) keeps working unchanged. `SaleStatusTarget` is still imported and still used in this file's type signatures — do not remove that import.

- [ ] **Step 5: Run the full backend gate**

Run: `npm run lint -- --max-warnings 0 && npm run typecheck && npm test`
Expected: all green. If `typecheck` flags an unused `SaleStatusTarget` or `UpdateSaleDto` import in `sales.service.ts`, you deleted one line too many — both types are still used by `assertLegalTransition` and the resolver helpers.

- [ ] **Step 6: Confirm the alias is gone everywhere**

Run: `grep -rn "\bsold\b" src --include="*.ts" | grep -v "soldAt\|SoldLeadTime\|soldCount\|SoldCount\|sold-lead-time\|sold-after-kickoff\|sold sales\|sold rows"`
Expected: no output. (`soldAt` and friends are unrelated timestamp/metric names and stay.)

- [ ] **Step 7: Stage**

```bash
git add src/api/sales/dto/update-sale.dto.ts src/api/sales/sales.service.ts src/api/sales/sales.service.spec.ts
```

Report: "Task 2 staged — `sold` alias removed from DTO, service and tests. Not committed."

---

### Task 3: Correct and trim the backend comments

**Files:**
- Modify: `src/api/sales/sales.service.ts:137-159`, `:404-414`

**Interfaces:**
- Consumes: Task 2's edits to the same file (run after it to avoid a conflicting rewrite of neighbouring lines).
- Produces: nothing — comment-only.

No test changes. No code changes. If you find yourself editing an expression, you are in the wrong task.

- [ ] **Step 1: Fix the comment that is factually wrong**

In `src/api/sales/sales.service.ts`, the preamble above `isKickoffGuarded` currently claims CSV-imported gifts are "past-match with `recipientId = null` by construction". That stopped being true when the import began requiring a recipient — `gifts.recipient_id` is `NOT NULL`. Replace the block:

```ts
// Selling and giving a ticket away are both decisions taken before the match,
// so entering either state after kickoff is refused. GIFTED -> GIFTED is NOT
// entry: it moves no status, it is how a recipient is attached, corrected or
// reused, and it is deliberately exempt. That exemption is what keeps the
// recipient combobox usable on CSV-imported gifts, which are past-match with
// recipientId = null by construction. See spec D5 and D10 — an intermediate
// draft of this rule guarded on the target alone and was reversed for exactly
// this reason. Do not reintroduce it.
// D5: GIFTED is reachable only from PENDING and is terminal. An illegal move
// is refused before the kickoff guard runs, so a SOLD -> GIFTED on a played
// match reports the transition, not the kickoff.
```

with:

```ts
// Selling and giving a ticket away are both decisions taken before the match,
// so entering either state after kickoff is refused. GIFTED -> GIFTED is NOT
// entry: it moves no status, and correcting who received a gift is not a
// decision that has to precede the match, so it is deliberately exempt
// (spec D5/D10 — guarding on the target alone breaks that exemption).
```

The `assertLegalTransition` ordering note is dropped because the code above already shows it: `assertLegalTransition` is called before `assertNotAfterKickoff` in `updateSale`.

- [ ] **Step 2: Trim the two migration-narration blocks in `updateSale`**

Replace:

```ts
        // A payload carrying `recipientId` / `recipientName` on an
        // already-GIFTED sale is a gift update whether or not `status` came
        // along for the ride. The shipped web form always sends
        // `status: 'GIFTED'` explicitly, but the DTO does not require it, and
        // `resolveTargetStatus` returns `undefined` when neither `status` nor
        // the deprecated `sold` is present. Without this check, that shape
        // fell through to the plain field-patch call below, which never
        // touches the gift row — the recipient change was silently dropped.
```

with:

```ts
        // A recipient sent for an already-GIFTED sale is a gift update whether
        // or not `status` came along: `status` is optional, and an absent one
        // means "leave the status alone", not "this is not a gift write".
```

and replace:

```ts
        // The mirror of the case above: a recipient sent for a sale that is
        // neither gifted nor becoming gifted has nowhere to go. It used to
        // fall through to the plain field-patch call and return 200 having
        // written nothing — the same silent-drop shape, just on the other
        // side of the branch. Every gift now has a recipient (spec D9), so
        // there is no reading of this payload that does something.
```

with:

```ts
        // The mirror of the case above: a recipient sent for a sale that is
        // neither gifted nor becoming gifted has nowhere to be written, so it
        // is refused rather than accepted and dropped.
```

Leave the `// Three intents, three db methods…` comment and both `resolveNewGiftRecipient` / `resolveExistingGiftRecipient` preambles as they are — they state live invariants, not history.

- [ ] **Step 3: Confirm nothing but comments moved**

Run: `git diff -U0 src/api/sales/sales.service.ts | grep -E "^[+-]" | grep -v "^[+-][+-]" | grep -vE "^[+-]\s*//"`
Expected: no output. Any line printed here is a code change that does not belong in this task.

- [ ] **Step 4: Run the backend gate**

Run: `npm run lint -- --max-warnings 0 && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 5: Stage**

```bash
git add src/api/sales/sales.service.ts
```

Report: "Task 3 staged — false kickoff-guard comment corrected, migration narration trimmed. Not committed."

---

### Task 4: Delete `flattenGift()` — serve the gift nested

**Files:**
- Modify: `src/api/sales/interfaces/sales.service.interface.ts`
- Modify: `src/api/sales/sales.service.ts:46-54`, `:82-93`, `:363-371`
- Modify: `src/db/sales/sales.query.ts:5-7`
- Test: `src/api/sales/sales.service.spec.ts:161-219`

**Interfaces:**
- Consumes: Tasks 2 and 3's edits to `sales.service.ts`.
- Produces: the wire shape Task 5 consumes — `getSale` returns `Sale` (with `Gift: { giftedAt; recipientId; Recipient: { id; name } } | null`), `getSales` / `getCurrentSeasonSales` / `getSeasonSales` return `FormattedSale[]` where `FormattedSale = Omit<Sale, 'Match' | 'userId' | 'matchId'> & { opponent: { id: OpponentId; name: string }; matchDate: Date }`. `SaleResponse` no longer exists.

**This is the breaking wire change.** Per spec D2 it is deliberate and its rollout window is accepted.

- [ ] **Step 1: Rewrite the three read tests to assert the nested shape**

In `src/api/sales/sales.service.spec.ts`, replace the whole `describe('reading a sale', ...)` block (the one containing "serves giftedAt and Recipient flattened onto the sale", "serves null for both fields" and "flattens the gift on every row") with:

```ts
    describe('reading a sale', () => {
        describe('when the sale has a gift', () => {
            it('serves the gift nested on the sale', async () => {
                const giftedAt = new Date('2026-03-01T12:00:00.000Z');

                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(
                        new Date('2026-03-02T20:00:00.000Z'),
                        SaleStatus.GIFTED,
                        giftFixture({
                            giftedAt,
                            recipientId: 'r1' as RecipientId,
                            Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                        }),
                    ),
                );

                const result = await service.getSale(userId, saleId);

                expect(result.Gift).toEqual({
                    giftedAt,
                    recipientId: 'r1',
                    Recipient: { id: 'r1', name: 'Marc' },
                });
            });
        });

        describe('when the sale has no gift', () => {
            it('serves a null gift', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(new Date('2026-03-02T20:00:00.000Z')),
                );

                const result = await service.getSale(userId, saleId);

                expect(result.Gift).toBeNull();
            });
        });

        describe('when listing sales', () => {
            it('keeps the gift nested on every row', async () => {
                salesDbService.getSales.mockResolvedValueOnce([
                    saleFixture(
                        new Date('2026-03-02T20:00:00.000Z'),
                        SaleStatus.GIFTED,
                        giftFixture({
                            giftedAt: new Date('2026-03-01T12:00:00.000Z'),
                            recipientId: 'r1' as RecipientId,
                            Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                        }),
                    ),
                ]);

                const [sale] = await service.getSales(userId);

                expect(sale?.Gift).toEqual({
                    giftedAt: new Date('2026-03-01T12:00:00.000Z'),
                    recipientId: 'r1',
                    Recipient: { id: 'r1', name: 'Marc' },
                });
            });
        });
    });
```

`saleFixture`'s third parameter already defaults to `null`, which is why the no-gift case asserts `toBeNull()` and not `toBeUndefined()`. Leave `saleFixture` and `giftFixture` themselves untouched.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npx jest src/api/sales/sales.service.spec.ts -t "reading a sale"`
Expected: FAIL — three failures, each reporting that `Gift` is `undefined` (the shim strips it) where an object or `null` was expected.

- [ ] **Step 3: Drop `SaleResponse` from the service interface**

`src/api/sales/interfaces/sales.service.interface.ts` in full after the edit:

```ts
import type { OpponentId, SaleId, UserId } from '@psg/shared/ids';
import type { ListedPrice, Profit } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';
import { Sale } from '../../../db/sales/type/sale.type';
import { AddSaleDto } from '../dto/add-sale.dto';
import { UpdateSaleDto } from '../dto/update-sale.dto';

// The wire shape is the stored shape: a sale carries its gift as the joined
// `Gift` row, null when it has none.
export type FormattedSale = Omit<Sale, 'Match' | 'userId' | 'matchId'> & {
    opponent: { id: OpponentId; name: string };
    matchDate: Date;
};

export abstract class ISalesService {
    abstract getSale(userId: UserId, saleId: SaleId): Promise<Sale>;
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
    // Manual repair for a sale gifted by mistake — not exposed by the
    // controller, since GIFTED is terminal in the app (spec D5/D16).
    abstract ungiftSale(userId: UserId, saleId: SaleId): Promise<void>;
}
```

`RecipientId` is no longer imported — it was only there for the flattened `Recipient` field.

- [ ] **Step 4: Delete the shim and its two call sites**

In `src/api/sales/sales.service.ts`, delete the function and its comment:

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

Change `getSale` to return the sale as loaded:

```ts
    async getSale(userId: UserId, saleId: SaleId): Promise<Sale> {
        const sale = await this.salesDbService.getOneSale(userId, saleId);

        if (!sale) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        return sale;
    }
```

Change `formatSale` to omit from the sale directly:

```ts
    private formatSale(sale: Sale): FormattedSale {
        return {
            ...omit(sale, ['Match', 'userId', 'matchId']),
            opponent: {
                id: sale.Match.Opponent.id,
                name: sale.Match.Opponent.name,
            },
            matchDate: sale.Match.date,
        };
    }
```

Finally fix the import block — `SaleResponse` is gone:

```ts
import { FormattedSale, ISalesService } from './interfaces/sales.service.interface';
```

- [ ] **Step 5: Run the tests to watch them pass**

Run: `npx jest src/api/sales/sales.service.spec.ts`
Expected: PASS, whole file.

- [ ] **Step 6: Correct the query comment that promised flattening**

In `src/db/sales/sales.query.ts`, replace:

```ts
// `Gift` is the sale's giftedness in full: its existence means gifted, its
// `giftedAt` is when, its `Recipient` is to whom. The api layer flattens it
// back onto the sale before it goes out on the wire (spec D17).
```

with:

```ts
// `Gift` is the sale's giftedness in full: its existence means gifted, its
// `giftedAt` is when, its `Recipient` is to whom. It goes out on the wire
// as it is stored.
```

- [ ] **Step 7: Confirm the flat shape is gone from the backend**

Run: `grep -rn "flattenGift\|SaleResponse" src`
Expected: no output.

Run: `npm run lint -- --max-warnings 0 && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 8: Stage**

```bash
git add src/api/sales/sales.service.ts src/api/sales/sales.service.spec.ts src/api/sales/interfaces/sales.service.interface.ts src/db/sales/sales.query.ts
```

Report: "Task 4 staged — `flattenGift` deleted, gift served nested. **Breaking wire change: the frontend (Task 5) must land before gift rendering works again.** Not committed."

---

### Task 5: Frontend reads the nested gift

**Files:**
- Modify: `web/src/lib/types.ts:56-60`, `:87-88`, `:104-105`, `:239-245`
- Modify: `web/src/routes/(app)/sales/[saleId]/+page.svelte:101-104`
- Modify: `web/src/routes/(app)/sales/+page.svelte:550-573`

**Interfaces:**
- Consumes: Task 4's wire shape — `Gift: { giftedAt: string; recipientId: string; Recipient: { id: string; name: string } } | null` on every sale the API returns. **Do not start this task until Task 4 is staged.**
- Produces: nothing downstream.

The three files change together because the type edit is what makes the `.svelte` edits type-check; splitting them would leave `npm run check` red at a task boundary.

- [ ] **Step 1: Replace the flat gift fields in the web types**

In `web/src/lib/types.ts`, add `SaleGift` immediately after the existing `SaleRecipient` declaration:

```ts
export type SaleRecipient = {
    id: string;
    name: string;
};

// `Recipient` is non-null inside a gift: gifts.recipient_id is NOT NULL, so a
// gift without a recipient is not representable.
export type SaleGift = {
    giftedAt: string;
    recipientId: string;
    Recipient: SaleRecipient;
};
```

In `SaleListItem`, replace:

```ts
    giftedAt?: string | null;
    Recipient?: SaleRecipient | null;
```

with:

```ts
    Gift: SaleGift | null;
```

Make the identical replacement in `SaleDetail`. `Gift` is required-but-nullable while its neighbours `createdAt?` / `soldAt?` / `cancelledAt?` stay optional — that inconsistency is accepted by spec D4; do not "fix" the neighbours.

- [ ] **Step 2: Delete the dead `UpdateSalePayload` type**

In the same file, delete this type whole — it has no references anywhere in `web/`, and its `sold` field is the frontend half of the alias Task 2 removed:

```ts
export type UpdateSalePayload = {
    saleId: SaleId;
    sold: boolean;
    invest?: Invest;
    listedPrice?: ListedPrice;
    allocations?: SaleAllocation[];
};
```

- [ ] **Step 3: Run the check to see exactly which consumers break**

Run: `cd web && npm run check`
Expected: FAIL — errors in `sales/[saleId]/+page.svelte` and `sales/+page.svelte` reporting that `Recipient` does not exist on `SaleDetail`. That error list is the complete set of consumers; if a file appears that is not in this task's **Files** list, stop and report it rather than editing it.

- [ ] **Step 4: Gate the detail page's recipient row on the gift**

In `web/src/routes/(app)/sales/[saleId]/+page.svelte`, replace:

```svelte
    {#if sale.status === 'GIFTED'}
        <span class="text-ink-muted">Recipient</span>
        <span class="text-ink">{sale.Recipient?.name ?? '—'}</span>
    {/if}
```

with:

```svelte
    {#if sale.Gift}
        <span class="text-ink-muted">Recipient</span>
        <span class="text-ink">{sale.Gift.Recipient.name}</span>
    {/if}
```

Gating on `sale.Gift` rather than the status is what lets the `?? '—'` go: the compiler narrows `Gift` to non-null inside the block, and a gift always has a recipient. A gift row exists exactly when the sale is `GIFTED`, so the rendered output is unchanged.

- [ ] **Step 5: Do the same in the sales-list edit drawer**

In `web/src/routes/(app)/sales/+page.svelte`, inside the gift form, replace:

```svelte
                        {#if editSale.status === 'GIFTED'}
                            <p class="text-sm text-ink">
                                <span class="font-medium text-gift-strong">Gifted</span>
                                <span class="text-ink-muted">·</span>
                                <span class="text-ink-muted">Given to</span>
                                <span class="text-ink">{editSale.Recipient?.name ?? '—'}</span>
                            </p>
                        {/if}
```

with:

```svelte
                        {#if editSale.Gift}
                            <p class="text-sm text-ink">
                                <span class="font-medium text-gift-strong">Gifted</span>
                                <span class="text-ink-muted">·</span>
                                <span class="text-ink-muted">Given to</span>
                                <span class="text-ink">{editSale.Gift.Recipient.name}</span>
                            </p>
                        {/if}
```

and replace the recipient input's placeholder:

```svelte
                                placeholder={editSale.status === 'GIFTED'
                                    ? (editSale.Recipient?.name ?? 'Name')
                                    : 'Name'}
```

with:

```svelte
                                placeholder={editSale.Gift?.Recipient.name ?? 'Name'}
```

Leave everything else in this form alone — in particular `{#if editSale.status === 'GIFTED' || (editSale.status === 'PENDING' && !isPastMatch)}`, `required={editSale.status !== 'GIFTED'}`, the `{editSale.status === 'GIFTED' ? 'Recipient' : 'Given to'}` label, the button label and the two hint paragraphs all stay status-driven. They decide whether the form is offered and how it reads, which is a status question, not a "does a gift row exist" question.

- [ ] **Step 6: Run the frontend gate**

Run: `cd web && npm run check && npm test`
Expected: both green. `npm run check` passing with zero `?.`-on-`Recipient` left is the proof that the deleted fallbacks were unreachable.

- [ ] **Step 7: Confirm the flat fields are gone from the frontend**

Run: `grep -rn "giftedAt\|\.Recipient" web/src`
Expected: only hits inside `web/src/lib/types.ts` (the `SaleGift` declaration) and the two `.svelte` files you just edited, each reading through `Gift`. No `Recipient?.` remains.

- [ ] **Step 8: Stage**

```bash
git add web/src/lib/types.ts "web/src/routes/(app)/sales/[saleId]/+page.svelte" "web/src/routes/(app)/sales/+page.svelte"
```

Report: "Task 5 staged — web reads the nested gift, dead fallbacks and dead `UpdateSalePayload` removed. Not committed."

---

### Task 6: Trim the `read-payload` docstrings

**Files:**
- Modify: `web/src/routes/(app)/sales/read-payload.ts:1-16`, `:31-36`, `:43-47`
- Modify: `web/src/routes/(app)/sales/[saleId]/read-payload.ts:1-14`

**Interfaces:**
- Consumes: nothing. Depends on no other task and may run at any point, including before Task 1.
- Produces: nothing — comment-only.

No code changes, no test changes. `read-payload.spec.ts` in both directories asserts on `FormData` only and needs no edit in this plan.

- [ ] **Step 1: Trim the sales-list docstring**

In `web/src/routes/(app)/sales/read-payload.ts`, replace the file's opening docstring:

```ts
/**
 * Two different forms on this route submit to `?/update`: the gift-form
 * (whose whole job is starting or updating a gift) and the edit-numbers form
 * (price/invest/allocations — it never touches status or the recipient).
 * Each declares its own intent explicitly via the hidden `intent` field
 * rather than being inferred from which optional fields happen to be
 * present — that inference is what broke this three times over: a `status`
 * value of `GIFTED` can arrive from either form for entirely different
 * reasons, so it can't be used on its own to decide whether a recipient is
 * required.
 */
```

with:

```ts
/**
 * Two forms on this route submit to `?/update`: the gift form and the
 * edit-numbers form. Each declares itself through the hidden `intent` field,
 * because `status: 'GIFTED'` can arrive from either one for different
 * reasons and so cannot decide on its own whether a recipient is required.
 */
```

- [ ] **Step 2: Trim the two inline comments in the same file**

Replace:

```ts
    // Only the gift-form's own submission needs a recipient. The
    // edit-numbers form never sends `intent="gift"` (in fact it no longer
    // sends `status` at all — UpdateSaleDto.status is optional, and the api
    // leaves status untouched when it's absent), so this block only ever
    // runs for the form that is actually asking about the recipient.
```

with:

```ts
    // Only the gift form asks about a recipient; the edit-numbers form sends
    // no `status` at all and the api leaves it untouched when absent.
```

and replace:

```ts
        // A name is required only on a genuine entry into GIFTED. An
        // already-GIFTED sale always has a recipient to fall back to (spec
        // D9), so a blank submit there can only mean "keep it" — the api
        // leaves the existing recipient untouched when none is supplied.
```

with:

```ts
        // A name is required only on entry into GIFTED. An already-GIFTED
        // sale always has one (spec D9), so a blank submit means "keep it".
```

- [ ] **Step 3: Trim the detail-page docstring**

In `web/src/routes/(app)/sales/[saleId]/read-payload.ts`, replace:

```ts
/**
 * This route's single form always submits a `status` value when the
 * PENDING/SOLD <select> is rendered — even when the user never touched it,
 * since a <select> always has a selected option. Resending the sale's
 * unchanged current status trips the backend's kickoff guard for an
 * already-SOLD, past-kickoff sale (`isKickoffGuarded('SOLD', 'SOLD')` is
 * unconditional), rejecting a plain price/invest edit with
 * `SALE_AFTER_KICKOFF`. The form also submits a hidden `currentStatus`
 * (the sale's status as loaded) so status is only forwarded on a genuine,
 * deliberate change — mirroring how the sales-list edit-numbers form omits
 * `status` entirely rather than resubmitting the current value.
 */
```

with:

```ts
/**
 * The PENDING/SOLD <select> always submits a value, even untouched. The
 * hidden `currentStatus` is what distinguishes that from a deliberate
 * change: resending an unchanged SOLD on a past-kickoff sale would trip the
 * backend's kickoff guard and reject a plain price edit.
 */
```

- [ ] **Step 4: Confirm nothing but comments moved**

Run: `cd web && git diff -U0 -- src/routes/ | grep -E "^[+-]" | grep -v "^[+-][+-]" | grep -vE "^[+-]\s*(//|\*|/\*)"`
Expected: no output.

- [ ] **Step 5: Run the frontend gate**

Run: `cd web && npm run check && npm test`
Expected: both green.

- [ ] **Step 6: Stage**

```bash
git add "web/src/routes/(app)/sales/read-payload.ts" "web/src/routes/(app)/sales/[saleId]/read-payload.ts"
```

Report: "Task 6 staged — `read-payload` docstrings trimmed. Not committed."

---

## Final verification

After all six tasks are staged, run both gates from a clean shell and confirm the scaffolding is gone:

```bash
npm run lint -- --max-warnings 0 && npm run typecheck && npm test
cd web && npm run check && npm test
```

```bash
grep -rn "v2" src/redis/                                  # expect: no output
grep -rn "flattenGift\|SaleResponse" src                  # expect: no output
grep -rn "UpdateSalePayload" web/src                      # expect: no output
grep -rn "deprecated" src/api/sales                       # expect: no output
```

Then report to the user that the full change is staged and ready for `/crit`. Do not commit.
