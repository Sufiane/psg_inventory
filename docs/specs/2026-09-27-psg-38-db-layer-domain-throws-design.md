# PSG-38 — db.ts files throw DomainException instead of returning null — Design

**Date:** 2026-09-27
**Status:** Implemented, uncommitted — design-review feedback of 2026-09-27 applied (the concurrent-delete interleaving must keep answering 404; the db writes now catch `P2025` and return an outcome, the usecase throws — see D1 Part B, D2, and behaviour item 2); code/security-review feedback of 2026-09-28 applied (cache-staleness delta documented in behaviour item 7, caught `P2025` logged, rethrow direction tested).
**Type:** Backend-only refactor. Behaviour-preserving at the HTTP boundary. No migration, no DTO/route/DI changes.

## Problem

The project's hexagonal split convention (user-global `CLAUDE.md`, "Backend architecture — hexagonal split") states, verbatim:

> `*.db.ts` — All data access. The only file in the module that imports the ORM. Methods return raw query results. **No domain throws here — return `null`/`undefined` and let the service decide.**

A repo-wide audit (2026-09-27) found exactly three violations — a grep for `DomainException` across all `*.db.ts` files confirms these are the only ones:

| # | File | Throw site | Code |
|---|---|---|---|
| 1 | `src/api/sales/usecases/update-sale/update-sale.usecase.db.ts` | line 215, inside private `loadSaleRowOrThrow` (line 206) | `SALE_NOT_FOUND` |
| 2 | `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.ts` | line 42, inside `ungiftSale` (line 36) | `SALE_NOT_FOUND` |
| 3 | `src/db/users/users.db.ts` | line 31, inside `create` (line 27) | `EMAIL_ALREADY_EXISTS` |

Sites 1 and 2 also **duplicate an existence check the calling usecase already performs** — and in both, the underlying read query is duplicated too: the usecase loads the sale row to make its decision, and the db write method reads it a second time.

## Current behaviour and callers

### 1 — update-sale

- `UpdateSaleUsecase.execute` (`update-sale.usecase.ts:31–35`) already loads `existing` via `this.db.getOneSale(...)` and throws `SALE_NOT_FOUND` itself if it is null. This is the check that should be the only one.
- The three write methods `updateSale` / `giftSale` / `updateGift` each call private `loadSaleRowOrThrow` (`update-sale.usecase.db.ts:206–219`): a second `prisma.sales.findUnique` plus the throw. The loaded row is not just a check — it feeds `applySaleWrite` (the SOLD/CANCELLED timestamp mirror needs the *pre-write* status, and the `saleHistories` entry snapshots pre-write `listedPrice`/`profit`/`status`).
- Grep confirms `UpdateSaleUsecase` is the sole caller of the three write methods.

### 2 — ungift-sale

- `UngiftSaleUsecase.execute` (`ungift-sale.usecase.ts:19–31`) calls `loadSale` (selects `{id, status}`), throws `SALE_NOT_FOUND` if null, throws `SALE_INVALID_STATUS_TRANSITION` if not `GIFTED`, then calls `ungiftSale`.
- `UngiftSaleUsecaseDb.ungiftSale` (`ungift-sale.usecase.db.ts:36–82`) re-reads the full row (`prisma.sales.findUnique`, line 37) for two reasons: (a) to re-check existence — the redundant throw at line 42 — and (b) to snapshot `listedPrice`/`profit`/`status` for the `saleHistories` entry written inside the transaction.
- Sole caller is the usecase. `scripts/ungift-sale.ts` reaches it via `SalesService → UngiftSaleUsecase.execute` and catches `DomainException` by code — it is a service-layer consumer and needs no change.

### 3 — users

- `UsersDb.create` catches Prisma `P2002` (unique violation on `users.email`) and throws `DomainException(EMAIL_ALREADY_EXISTS)`; every other error is rethrown unchanged.
- Sole caller: `UsersService.create` (`users.service.ts:14–23`), behind `POST /users` (`users.controller.ts:17–21`). There is **no** pre-check anywhere — the P2002 catch is the only duplicate-email guard, so nothing here is duplicated; the throw simply lives in the wrong layer.
- On the wire: `DomainException` → `http-exception.mapper.ts:30–31` → `409 Conflict` with body `email_already_exists`. `web/src/routes/register/+page.server.ts:98` keys off the status code `409` only.

## Goal

1. Zero files under `src/db/` or named `*.db.ts` import `domain.exception.ts` / `error-codes.enum.ts`.
2. Every decision to throw lives in the calling usecase/service.
3. The two duplicated sale-row reads are removed (one query per operation instead of two), and no new read is introduced — write outcomes come from the write that already ran (`P2025` on `tx.sales.update`), never from a fresh `findUnique`.
4. HTTP behaviour is byte-identical: same status codes, same error bodies — including the concurrent-delete interleaving, which must still answer `404 sale_not_found` (via the write outcome, not via a duplicate read).

## Non-goals

- No route, DTO, response-shape, Prisma schema, migration, or module/DI wiring changes.
- `updateGift`'s gift-row lookups/writes (`tx.gifts.findUniqueOrThrow`, `tx.gifts.update`) can also raise `P2025` when a GIFTED sale has no gift row. Under D1 Part B's blanket `P2025 → not_found` catch, that pre-existing data corruption maps to 404 where the pre-fix code answered 500 — see "Behaviour preservation" item 3 for the analysis and why it is accepted. Reaching a *decision* about that state is out of scope; producing it via the API is impossible (gift row and status are written in one transaction, spec D15).
- `MatchesDb.createMatch` (`matches.db.ts:250–256`) swallows `P2002` with a silent `return`. That is a *different* smell (silent no-op, no signal to the service) but not a domain throw in the db — not part of PSG-38. Noted here for a possible future `docs/tech-debt.md` entry.
- The Playwright `e2e/` suite asserts none of these paths (verified: no register-duplicate or ungift e2e coverage); it runs in CI unchanged.
- `SaleRowSnapshot` and `SaleWriteOutcome` are declared once per usecase module (`update-sale.usecase.db.ts` and `ungift-sale.usecase.db.ts`) rather than in a shared type module — intentional module autonomy (each usecase owns its contract); deduplicating into e.g. `src/db/sales/type/` is a possible follow-up (code-review nit 2026-09-28).

## Design decisions

### D1 — update-sale: the pre-write row becomes an input of the write methods, writes report an outcome

**Part A — the row becomes a payload field.** Delete `loadSaleRowOrThrow`. Add a **required payload field** to the three write methods on `IUpdateSaleUsecaseDb`:

```ts
// update-sale.usecase.db.ts — new exported types + payload field
export type SaleRowSnapshot = {
    id: string;
    status: SaleStatus;
    listedPrice: number;
    profit: number;
};

export type SaleWriteOutcome = 'written' | 'not_found';

abstract updateSale(payload: {
    saleId: SaleId;
    userId: UserId;
    profit: Profit | undefined;
    invest?: Invest;
    listedPrice?: ListedPrice;
    status?: 'PENDING' | 'SOLD';
    allocations?: SaleAllocationInput[];
    currentSale: SaleRowSnapshot;   // ← new
}): Promise<SaleWriteOutcome>;      // ← was void
// giftSale(...) and updateGift(...) gain the same currentSale field and
// change return type to Promise<{ recipientId: RecipientId } | null>
```

The snapshot shape is exactly what `applySaleWrite` already consumes as `currentSale`. `UpdateSaleUsecase.execute` passes its already-loaded `existing` at its three db call sites inside `execute`: `currentSale: existing` (structurally assignable — `Sale` carries branded `SaleId`/`ListedPrice`/`Profit`, all subtypes of the raw primitives). The write methods stop reading `prisma.sales` entirely; the `DomainException`/`ErrorCode` imports are removed.

**Why a payload field and not a positional second argument:** all 14 call-site assertions in `update-sale.usecase.spec.ts` take the form `toHaveBeenCalledWith(expect.objectContaining({...}))` (lines 196, 219, 240, 359, 376, 393, 501, 529, 586, 654, 684, 736, 761, 949). `objectContaining` ignores extra payload properties, so those stay green; a second positional argument would fail all 14 on argument-count mismatch while buying no clarity. The `mock.calls[0][0]` property probes (lines 244, 473) also keep working.

**Part B — the write reports what physically happened; the usecase decides what it means.** The row the usecase loaded can be deleted between that load and the write. The db must report that as plain data, not as a throw and not as an unhandled Prisma error:

- Each write method wraps its `$transaction` in `try/catch`. When the transaction rejects with `Prisma.PrismaClientKnownRequestError` code `P2025` (Prisma rethrows the callback's error after rolling the transaction back), the method returns the not-found outcome: `'not_found'` for `updateSale` (and for `ungiftSale`, D2), `null` for `giftSale`/`updateGift`. The caught `P2025` is logged server-side at `warn` (code + `meta`) before the outcome is returned, so an unexpected source of the error stays observable (security review 2026-09-28). Any other error rethrows unchanged → 500, as today — pinned by a rethrow test per write method.
- **Cache invalidation is skipped on the not-found path** — the method returns directly from the `catch`, before the post-transaction invalidation. Rationale: (a) the transaction rolled back, so nothing was written and no cache is stale because of us; (b) byte-identical to today, where the `loadSaleRowOrThrow` throw fired before any invalidation ran; (c) in the concurrent-delete case, the deleting path (`DeleteSaleUsecaseDb`) invalidated the affected namespaces itself.
- The `P2025` comes from `tx.sales.update` inside the transaction that was already running — **no new `findUnique` read is introduced**; the outcome is the physical result of the write itself.
- The calling usecase translates the outcome into the throw:

```ts
// update-sale.usecase.ts — the three branches of execute()
const gift = await this.db.giftSale({ ...fieldPatch, currentSale: existing, recipient });
if (gift == null) {
    throw new DomainException(ErrorCode.SALE_NOT_FOUND);
}
const { recipientId } = gift;
await this.salesCacheInvalidator.afterWrite(...);   // only on the written path

// updateGift: same shape (result == null → throw).
const outcome = await this.db.updateSale({ ...fieldPatch, currentSale: existing });
if (outcome === 'not_found') {
    throw new DomainException(ErrorCode.SALE_NOT_FOUND);
}
await this.salesCacheInvalidator.afterWrite(...);
```

So `SALE_NOT_FOUND` now has two sources in the usecase — the initial load (existing) and the write outcome (new) — both in the service layer, mapping to 404 exactly as today.

**Why this outcome shape (and it is deliberately mixed):**

- `giftSale`/`updateGift` already return an object (`{ recipientId }`), so absence rides as `| null` — the exact idiom D3 uses for `create(): Users | null` and reads use already use (`loadSale(): … | null`). Success keeps `{ recipientId }`, so existing success-path assertions (`toEqual({ recipientId: 'r5' })`) stay unchanged.
- `updateSale`/`ungiftSale` succeed with `void`. `Promise<void | null>` would spell absence two ways (`undefined` vs `null`) at the same call site; a two-member string union reads unambiguously at the check: `if (outcome === 'not_found')`. Plain strings are raw data — no domain imports, so the D4 rule stays valid.
- Rejected: a discriminated union for all four (`{ status: 'written', recipientId? } | { status: 'not_found' }`) — one uniform shape, but ceremony at two call sites that gain nothing; rejected `Promise<boolean>` — carries no meaning at the call site.

**Rejected alternatives (Part A):**

- *Keep the read in the db, return null when missing:* write methods would need a nullable result the usecase must check after every write (and before cache invalidation), it preserves the duplicated query, and it re-introduces a second existence check the issue says to remove.
- *Have the db skip `currentSale` entirely and derive history from `payload`:* `applySaleWrite` needs the pre-write status for the SOLD/CANCELLED timestamp mirror and pre-write `listedPrice`/`profit` for the history entry — data that exists only on the loaded row.

**Usecase logic change:** its initial `SALE_NOT_FOUND` check (lines 33-35) stays as the load-time check; the three write call sites gain `currentSale: existing` (Part A) and, new, the outcome check above (Part B) placed **before** `salesCacheInvalidator.afterWrite`.

### D2 — ungift-sale: one read, the row passed into the write, write reports an outcome

- Widen `loadSale`'s select to `{ id: true, status: true, listedPrice: true, profit: true }` and its declared return type to `SaleRowSnapshot | null` (same exported shape as D1: `{ id, status, listedPrice, profit }`).
- `ungiftSale(userId, saleId, currentSale)` — new third parameter: the row the usecase just loaded. Drop the internal `findUnique` and the throw, drop the `DomainException`/`ErrorCode` imports. The transaction writes the history entry from `currentSale` exactly as today.
- Return type becomes `Promise<SaleWriteOutcome>` (`'written' | 'not_found'`, same exported type as D1). The method wraps its `$transaction` in `try/catch`: a `P2025` from `tx.sales.update` (the sale row deleted between the usecase's load and this write — transaction rolls back) returns `'not_found'`; any other error rethrows. Cache invalidation (the four namespaces) sits after the `catch` and therefore **does not run on the not-found path** — same decision and rationale as D1 Part B. `ungiftSale`'s transaction can only raise `P2025` from `tx.sales.update` (`gifts.deleteMany` never throws for missing rows; `saleHistories.create` would raise `P2003`, not `P2025`) — so here the blanket `P2025 → 'not_found'` mapping is exact with no edge cases.
- Usecase:

```ts
const outcome = await this.usecaseDb.ungiftSale(userId, saleId, existing);
if (outcome === 'not_found') {
    throw new DomainException(ErrorCode.SALE_NOT_FOUND);
}
```

The throw already lives in the usecase (`ungift-sale.usecase.ts:23`) where it belongs; the db's copy of it was pure duplication. Net effect: one read instead of two, and the load-then-write race still answers `SALE_NOT_FOUND` → 404. Precedent for passing loaded data down: `DeleteSaleUsecaseDb.deleteSale(userId, saleId, saleStatus)` already does exactly this.

**Rejected alternatives:**

- *Keep the read inside `ungiftSale`, silently return when null:* hides a broken invariant behind a no-op write and reintroduces the duplicate query.
- *Keep the read, return `Promise<void | null>`:* an ambiguous contract whose only consumer — the usecase's own null check — already exists one frame higher.
- *Let `P2025` propagate (500):* not byte-identical — the concurrent-delete interleaving must keep answering 404, exactly as the pre-fix double-check did.

### D3 — users: db returns the raw result, null on unique violation

```ts
// src/db/users/users.db.ts
async create(payload: {
    email: Email; firstName: string; lastName: string; password: HashedPassword;
}): Promise<Users | null> {
    try {
        return await this.prisma.users.create({ data: payload });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            return null;
        }
        throw e;
    }
}
```

- `IUsersDbService.create(...)` return type becomes `Promise<Users | null>`.
- `UsersService.create` gains the throw:

```ts
// src/api/users/users.service.ts
const created = await this.userDbService.create({ ... });
if (created == null) {
    throw new DomainException(ErrorCode.EMAIL_ALREADY_EXISTS);
}
```

`users.db.ts` drops its `DomainException`/`ErrorCode` imports (the `Prisma` import stays — it is a db file, that is legal).

**Why the P2002 → null translation stays in the db:** P2002 is an ORM-level signal; mapping "unique violation" to "no row was created" (`null`) is data-access work. Pushing the raw error upward would force the service to import/know Prisma — forbidden by the `no-orm-outside-db` dependency-cruiser rule. A service-side `findOneByEmail` pre-check would add a query and still be racy; the constraint catch is the real guard and remains in the db.

**Pattern symmetry:** this is the reference instance of the pattern D1 Part B and D2 generalise — the db catches an ORM constraint/absence signal (`P2002`), returns plain data (`null`), and the calling service/usecase makes the decision to throw. One signal→data→throw pipeline across all three sites.

**Rejected alternatives:**

- `Promise<boolean>` — not a raw query result; the created row *is* what `prisma.users.create` returns, so returning it is the zero-cost, convention-faithful shape.
- Service catching Prisma errors — leaks the ORM across the layer boundary.

### D4 — optional enforcement: a dependency-cruiser rule (separately staged)

After D1–D3, grep shows zero db-layer imports of `domain.exception.ts`/`error-codes.enum.ts`, so the tree is rule-ready. A new rule in `.dependency-cruiser.cjs`, mirroring the existing `no-prisma-service-outside-db` shape:

```js
{
    name: 'no-domain-exception-in-db',
    comment:
        'db files return raw query results or null; deciding to throw a DomainException belongs to the service/usecase (CLAUDE.md hexagonal split).',
    severity: 'error',
    from: { path: ['^src/db/', '\\.db\\.ts$'], pathNot: ['\\.spec\\.ts$'] },
    to: { path: ['^src/common/exceptions/(domain\\.exception|error-codes\\.enum)\\.ts$'] },
}
```

Staged as its own final task so the fix diff stays separable; drop-able if the team prefers convention-only. The `pathNot: ['\\.spec\\.ts$']` exemption mirrors the other rules (spec files don't ship). The D1/D2 outcome types (`'written' | 'not_found'`, `| null`) are plain data defined in the db files themselves and import nothing from `src/common/exceptions/` — the rule stays valid and passes on the fixed tree.

## Behaviour preservation and accepted risks

1. **HTTP mapping is origin-independent.** `toHttpException` keys off the exception instance and its `ErrorCode`, not on which layer threw. `SALE_NOT_FOUND` → 404, `EMAIL_ALREADY_EXISTS` → 409 — unchanged. The frontend (`web/`) consumes status codes only (register: `409`; sales errors surface generically) → **no frontend changes**.
2. **The concurrent-delete interleaving still answers 404 (this was a required change, not an accepted delta):** a sale deleted between the usecase's load and the write used to be caught by the db's inner double-check (`loadSaleRowOrThrow` → 404) and, in the narrower window between that inner load and the transaction, used to surface as `P2025` → 500. After this change there is no inner load: `tx.sales.update` raises `P2025`, the db catches it, rolls back (Prisma rolls back automatically when the transaction callback throws), returns `'not_found'`/`null`, and the usecase throws `DomainException(SALE_NOT_FOUND)` → **404**. The window that previously answered 404 still answers 404, and the window that previously answered 500 now answers 404 too — strictly closer to the pre-race behaviour, never further. Verified by tests at both layers (db: `P2025 → 'not_found'`; usecase: `'not_found'/null → SALE_NOT_FOUND`; mapper: `SALE_NOT_FOUND → 404`, newly pinned).
3. **One acknowledged delta, reachable only through a stale-cache race or direct SQL:** `updateGift`'s gift-row operations (`tx.gifts.findUniqueOrThrow`, `tx.gifts.update`) raise `P2025` when a GIFTED sale has no gift row. The blanket catch reports that as `'not_found'` → 404, where the pre-fix code propagated it → 500. Accepted because: the state is not producible by an ordinary API sequence (D15 writes gift row and status in one transaction, and `updateGift` is only routed for a sale the usecase loaded as `GIFTED` — but that load can come from the 1h sale cache while a concurrent ungift has committed and not yet invalidated, see item 7, so the window is tiny rather than nonexistent); and 404 ("this gifted sale's gift cannot be found") is not a lie to a client, whereas 500 never was a contract. The caught `P2025` is logged server-side, so if data corruption ever occurs it stays observable. Rejected: a sentinel error class thrown from inside `applySaleWrite`'s `sales.update` catch and matched at the method level — exact, but it is control-flow machinery across two catch layers to defend a rare state. Revisit only if data corruption is ever observed (then it earns a tech-debt entry).
4. **Cache invalidation on the not-found path: skipped, deliberately.** On `'not_found'`/`null` no invalidation runs anywhere (db's post-transaction invalidation is bypassed by the early return; the usecase throws before `salesCacheInvalidator.afterWrite`). Nothing was written, so nothing is stale because of us; the concurrent deleter's own path invalidated already; and this matches the pre-fix flow, where the inner throw fired before any invalidation. Tests assert the skip at both layers.
5. **`scripts/ungift-sale.ts`** catches `SALE_NOT_FOUND` / `SALE_INVALID_STATUS_TRANSITION` from the service path; both still originate in `UngiftSaleUsecase.execute`. Script untouched.
6. **Register flow:** `create → null → DomainException(EMAIL_ALREADY_EXISTS)` is the same exception the mapper already converts to 409; `web` register keeps showing "An account with that email already exists."
7. **Accepted delta: the update-sale snapshot input may be cache-stale (code review 2026-09-28).** `existing` comes from `db.getOneSale`, which reads through Redis (`CACHE_KEYS.sale`, 1h TTL), whereas the deleted `loadSaleRowOrThrow` always read Postgres immediately before the transaction. The `saleHistories` snapshot and the SOLD/CANCELLED timestamp mirror are therefore computed from a row loaded at the start of `execute` and possibly served from cache: under a concurrent write, a stale `PENDING` row means a PENDING-target update no longer clears a `soldAt` set by a concurrent SOLD write, and history can record a value that predates another committed update. Same millisecond-scale concurrency as elsewhere in this spec; ownership is still enforced at write time (`tx.sales.update({ where: { id, userId } })`, uncached). `ungift-sale` is unaffected (`loadSale` reads Postgres directly, just earlier). Accepted rather than fixed: closing it would require re-introducing a fresh read inside the write path — the exact duplication PSG-38 exists to remove. (Note: the sale cache key itself is keyed by `saleId` only — a pre-existing, out-of-scope concern tracked separately.)

## Testing

**Updated (behaviour of tests changes with the contract):**

- `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.spec.ts`
  - `loadSale` select assertion gains `listedPrice`/`profit`.
  - `ungiftSale` block: drop the `prisma.sales.findUnique` setup and the `throws SALE_NOT_FOUND` test (lines 90–96); pass a `currentSale` fixture as the new third argument at every call; keep the transaction-order and cache-invalidation tests (success path must still invalidate all four namespaces and may now assert `'written'`); add `expect(prisma.sales.findUnique).not.toHaveBeenCalled()` as a regression guard for the duplicate read.
  - **New:** `P2025` from `tx.sales.update` → returns `'not_found'`, skips all four cache invalidations, still performs no `findUnique`.
  - **New (review round 2026-09-28):** the catch logs the `P2025` at `warn` before returning; `describe('when the transaction rejects with an unexpected error')` → non-P2025 failure rethrows unchanged (identity) with no invalidation.
- `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.spec.ts`
  - Line 64: `toHaveBeenCalledWith(userId, saleId, <the fixture loadSale returned>)`; the happy path mocks `ungiftSale` → `'written'`.
  - The `SALE_NOT_FOUND` and `SALE_INVALID_STATUS_TRANSITION` tests are unchanged — the usecase still throws both.
  - **New (the preserved-404 path):** load resolves a GIFTED row (so the load-time check passes) but `ungiftSale` resolves `'not_found'` → `execute` rejects with `code: SALE_NOT_FOUND`.
- `src/api/sales/usecases/update-sale/update-sale.usecase.db.spec.ts`
  - Remove the three `prisma.sales.findUnique.mockResolvedValue(...)` `beforeEach` hooks (lines 85–87, 140–142, 264–268).
  - Add `currentSale: <snapshot>` to all 11 write-method invocations (lines 92, 110, 128, 154, 202, 217, 230, 249, 274, 301, 320) — via the existing `currentSaleRow()` helper, retyped from `unknown` to `SaleRowSnapshot`.
  - Replace `describe('when the sale does not belong to the user') → throws SALE_NOT_FOUND` (lines 123–136) with a guard asserting the write methods never call `prisma.sales.findUnique`.
  - **New:** for each of the three write methods, `P2025` from `tx.sales.update` → `updateSale` returns `'not_found'`, `giftSale`/`updateGift` return `null` — each asserting cache invalidation is skipped and no `findUnique` ran; success paths assert `'written'` / `{ recipientId }` as before.
  - **New (review round 2026-09-28):** per write method, the catch logs the `P2025` at `warn` (code/message/meta); `describe('when the transaction rejects with an unexpected error')` → non-P2025 failure rethrows unchanged (identity) with no invalidation.
- `src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts`
  - Existing `objectContaining` assertions pass unchanged (D1 rationale). The `beforeEach` defaults for `giftSale`/`updateGift` (lines 69–74) return `{ recipientId }`, so the new null checks pass without touching those tests.
  - Strengthen the "calls the generic update with the narrowed status" test (line 750–766) to also assert `currentSale` is forwarded from the loaded fixture — this pins the new usecase↔db contract from the usecase side.
  - The `SALE_NOT_FOUND` test (line 124–138) is unchanged.
  - **New (the preserved-404 path, one per write branch):** load resolves a row, then `updateSale` resolves `'not_found'` (and separately `giftSale` / `updateGift` resolve `null`) → `execute` rejects with `code: SALE_NOT_FOUND` and `redisService.invalidatePattern` was never called (`SalesCacheInvalidator.afterWrite` skipped).

**New (no coverage existed):**

- `src/db/users/users.db.spec.ts` — `create` returns the created row; returns `null` when Prisma throws `P2002`; rethrows any other error.
- `src/api/users/users.service.spec.ts` — hashes the password then delegates; throws `DomainException(EMAIL_ALREADY_EXISTS)` when the db returns `null`; resolves `void` when it returns a row.
- `src/common/exceptions/http-exception.mapper.spec.ts` — pins the wire contract the outcome pattern must preserve: `new DomainException(ErrorCode.SALE_NOT_FOUND)` → `NotFoundException` with status `404`, and `EMAIL_ALREADY_EXISTS` → `ConflictException` with status `409`. (No mapper spec exists today; this is the "404" half of the `P2025 → 'not_found'` → `SALE_NOT_FOUND` → **404** chain — the db and usecase tests cover the other two links.)

Both follow the repo's vitest style (`Test.createTestingModule` + `mockDeep`, `describe`-per-branch with `when X` titles per CLAUDE.md).

## Verification gate

Same gate every phase of this repo's refactors uses:

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build
```

`lint:deps` only becomes load-bearing once D4 lands. `npm test` is `vitest run`. Implementation must start from `npm ci` + a green baseline on the untouched tree.
