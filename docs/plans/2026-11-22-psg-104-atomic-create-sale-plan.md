# PSG-104 Atomic create sale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /sales` accepts optional `status` (PENDING | SOLD | GIFTED) and `recipientName`, creates the sale in its final status in one transaction, and lets a GIFTED sale omit `listedPrice` (stored 0/0).

**Architecture:** New `create-sale` usecase (+ own usecase db) under `src/api/sales/usecases/`. Shared invariants (kickoff guard, gift recipient resolution) are extracted from `UpdateSaleUsecase` into `src/api/sales/shared/` and reused by both. `SalesService.addSale` becomes a thin delegate; `ISalesDbService.addSale` is deleted.

**Tech Stack:** NestJS, Prisma, vitest + `vitest-mock-extended`, class-validator.

**Spec:** `docs/specs/2026-11-22-psg-104-atomic-create-sale-design.md`

## Global Constraints

- Backend only. No schema change, no Prisma migration (columns accept 0).
- Hexagonal split: `*.usecase.ts` has no ORM import; `*.usecase.db.ts` is the only file in the usecase folder importing Prisma. No usecase-db shortcut is needed (spec D5).
- Branded types: `ListedPrice`, `Profit`, `Invest`, `SaleId`, `MatchId`, `UserId`, `RecipientId`. Cast to a brand only inside `*.db.ts`. Zero is built by the same cast pattern the db files already use for ORM reads; no blind `as` in the usecase.
- Error codes are snake_case via `DomainException(ErrorCode.X)`. Log readable detail via `Logger` at the throw site only where the existing code does; pure helpers throw only the code.
- Explicit return types everywhere, `readonly` constructor params, no inline `if`, blank line before `if/for/while/return/throw`, no single-letter names, numeric separators on 5+ digit literals, no barrel files, no comments unless the why is non-obvious.
- Tests: vitest, one nested `describe` per condition ("when ..."), short `it` titles stating only the outcome, shared setup in that `describe`'s `beforeEach`.
- Conventional commits (`refactor(sales): ...`, `feat(sales): ...`), lowercase imperative. Stage and stop, do not commit until the user has run `/crit`. No PR numbers in titles or bodies. Branch name `psg-104` before any push.
- Keep `UpdateSaleUsecase.execute` behaviour byte-for-byte; its 1 000-line spec must stay green with only provider changes.
- Cognitive complexity of any new function stays under 15 (ratchet is 27; do not add a new offender).

## Size and ticket split

Estimate about 880 lines total, over the 800 cap, so two PRs. Layer: backend. Actor: athlete.

| Slice | Tasks | Est. lines (tests included) | Depends on |
|---|---|---|---|
| A. Extract shared invariants | 1, 2 | 260 | none |
| B. Atomic create | 3, 4, 5, 6, 7, 8 | 620 | A |

Slice A is a pure refactor: no behaviour or contract change. Slice B delivers the feature and the PSG-90 doc updates.

| Task | Est. lines |
|---|---|
| 1 `sale-kickoff.guard.ts` + spec, update usecase uses it | 90 |
| 2 `gift-recipient.resolver.ts` + spec, update usecase + spec providers | 170 |
| 3 `CreateSaleDto`, error code, mapper | 45 |
| 4 `create-sale.usecase.db.ts` + spec | 190 |
| 5 `create-sale.usecase.ts` + spec + module | 270 |
| 6 Service, controller, interface, delete `addSale`, service spec | 40 |
| 7 README, tech-debt | 15 |
| 8 PSG-90 doc updates | 40 (net, mostly deletions) |

Follow-up tickets (file them, not footnotes): (a) un-gift of a price-less gift returns PENDING at price 0 (spec section 5); (b) accept `recipientId` on create, only if a form needs it.

Frontend independence: backend-only plan. PSG-90 (web) is blocked by slice B and can start once B merges; nothing here can run in parallel with a frontend builder except slice A and the PSG-90 helper tasks 1, 2, 5 which do not call the API.

---

## SLICE A

### Task 1: Extract the kickoff guard

**Files:**
- Create: `src/api/sales/shared/sale-kickoff.guard.ts`
- Create: `src/api/sales/shared/sale-kickoff.guard.spec.ts`
- Modify: `src/api/sales/usecases/update-sale/update-sale.usecase.ts` (remove `assertNotAfterKickoff` and `isKickoffGuarded` at the bottom, import the shared one)

**Interfaces:**
- Produces: `assertNotAfterKickoff(matchDate: Date, current: RawSaleStatus | null, target: SaleStatusTarget | undefined): void`. Throws `DomainException(ErrorCode.SALE_AFTER_KICKOFF)` when `target` is defined, the move is guarded, and `matchDate.getTime() <= Date.now()`.
- Guarded move rule (moved verbatim): target SOLD always; target GIFTED when `current !== 'GIFTED'` (null counts as not gifted, which is what create passes).

- [ ] **Step 1: Write the failing spec.** `describe('assertNotAfterKickoff')` with `beforeEach` using `vi.useFakeTimers()` / `vi.setSystemTime`, `afterEach` real timers. Nested describes: "when the match has kicked off" (`it` per case: SOLD from PENDING throws; GIFTED from PENDING throws; GIFTED from null throws; PENDING target does not throw; GIFTED to GIFTED does not throw; target undefined does not throw), "when the match is in the future" (SOLD and GIFTED do not throw). Assert `toThrow` with `code` via `expect(() => ...).toThrowError(expect.objectContaining({ code: ErrorCode.SALE_AFTER_KICKOFF }))` following how sibling specs assert `DomainException`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/api/sales/shared/sale-kickoff.guard.spec.ts`
- [ ] **Step 3: Implement.** Move the two functions and their two why-comments (the GIFTED to GIFTED exemption comment is load-bearing and stays) into the new file; change the signature as above. In `UpdateSaleUsecase.execute`, replace `assertNotAfterKickoff(existing, target)` with `assertNotAfterKickoff(existing.Match.date, existing.status, target)`. Keep `assertLegalTransition` and `LEGAL_TRANSITIONS` where they are.
- [ ] **Step 4: Run** the new spec and `npx vitest run src/api/sales/usecases/update-sale` , expect PASS (update spec untouched).
- [ ] **Step 5:** Stage.

---

### Task 2: Extract the gift recipient resolver

**Files:**
- Create: `src/api/sales/shared/gift-recipient.resolver.ts`
- Create: `src/api/sales/shared/gift-recipient.resolver.spec.ts`
- Modify: `src/api/sales/usecases/update-sale/update-sale.usecase.ts` (constructor swaps `IRecipientsDbService` for the resolver; delete `resolveNewGiftRecipient`, `resolveExistingGiftRecipient`, `assertOwnedRecipient`)
- Modify: `src/api/sales/usecases/update-sale/update-sale.usecase.module.ts` (add `GiftRecipientResolver` to providers)
- Modify: `src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts` (provider setup only: add `GiftRecipientResolver` as a real provider; the existing `IRecipientsDbService` mock stays and feeds it)

**Interfaces:**
- Produces, `@Injectable() export class GiftRecipientResolver` with constructor `(private readonly recipientsDbService: IRecipientsDbService)`:
  - `resolveNew(userId: UserId, input: { recipientId?: RecipientId; recipientName?: string }): Promise<GiftRecipientInput>`: id given then ownership check (`SALE_GIFT_RECIPIENT_NOT_FOUND` if not owned) and `{ recipientId }`; else `normalizeRecipientName(name ?? '')`, empty then `SALE_GIFT_RECIPIENT_REQUIRED`, else `{ recipientName }`.
  - `resolveExisting(userId, input): Promise<GiftRecipientInput | undefined>`: id given then ownership check; blank name then `undefined`; else `{ recipientName }`.
- Consumes: `IRecipientsDbService.findByIdForUser`, `normalizeRecipientName`, `GiftRecipientInput`.

- [ ] **Step 1: Write the failing spec.** Mocked `IRecipientsDbService` (`mockDeep`). Describes: "resolveNew" with nested "when a recipient id is given" (owned returns id; not owned rejects with `SALE_GIFT_RECIPIENT_NOT_FOUND`), "when a name is given" (normalises whitespace, returns `{ recipientName }`), "when the name is blank or missing" (rejects with `SALE_GIFT_RECIPIENT_REQUIRED`); "resolveExisting" with "when a recipient id is given", "when a name is given", "when the name is blank" (returns `undefined`).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Move the three private methods' bodies into the class, keeping the two spec-reference comments that explain why blank means "keep" vs "required" (shortened to the why). In `UpdateSaleUsecase`, inject `GiftRecipientResolver` and call `this.giftRecipientResolver.resolveNew(userId, payload)` / `resolveExisting(userId, payload)`. `UpdateSaleDto` is structurally compatible with the input type. Remove the now-unused `IRecipientsDbService`, `RecipientId`, `normalizeRecipientName` imports from the usecase.
- [ ] **Step 4: Run** `npx vitest run src/api/sales` , expect PASS; `npm run lint` on touched files.
- [ ] **Step 5:** Stage. Stop for `/crit` if shipping slice A alone.

---

## SLICE B

### Task 3: Create DTO, error code, mapper

**Files:**
- Create: `src/api/sales/dto/create-sale.dto.ts`
- Modify: `src/common/exceptions/error-codes.enum.ts` (add `SALE_LISTED_PRICE_REQUIRED = 'sale_listed_price_required'`)
- Modify: `src/common/exceptions/http-exception.mapper.ts` (map it to `BadRequestException`, same shape as `SALE_GIFT_RECIPIENT_REQUIRED`)
- Test: extend the existing mapper spec if one exists (`ls src/common/exceptions/*.spec.ts`); add one `it` that the new code maps to 400.

**Interfaces:**
- `CreateSaleDto extends OmitType(AddSaleDto, ['listedPrice'] as const)` (from `@nestjs/swagger`) with:
  - `@IsOptional() @IsNumber() @Min(1) listedPrice?: ListedPrice`
  - `@IsOptional() @IsIn(SALE_STATUS_TARGETS) status?: SaleStatusTarget` (export the existing array from `update-sale.dto.ts` or redeclare the literal list; do not create a barrel)
  - `@IsOptional() @IsString() @MaxLength(120) recipientName?: string`

- [ ] **Step 1:** Write the mapper test (if a mapper spec exists), expect FAIL.
- [ ] **Step 2:** Implement enum, mapper entry, DTO.
- [ ] **Step 3:** `npx vitest run src/common` PASS; `npx tsc --noEmit -p tsconfig.json` clean. Stage.

---

### Task 4: Create usecase db

**Files:**
- Create: `src/api/sales/usecases/create-sale/create-sale.usecase.db.ts`
- Test: `src/api/sales/usecases/create-sale/create-sale.usecase.db.spec.ts`

**Interfaces:**
- Produces:

```ts
export type CreateSaleWrite = {
    userId: UserId;
    matchId: MatchId;
    status: SaleStatusTarget;
    listedPrice?: ListedPrice;
    profit?: Profit;
    invest?: Invest;
    allocations: SaleAllocationInput[];
    recipient?: GiftRecipientInput;
};

export abstract class ICreateSaleUsecaseDb {
    abstract getMatchDate(matchId: MatchId): Promise<Date | null>;
    abstract createSale(payload: CreateSaleWrite): Promise<{ id: SaleId; recipientId: RecipientId | null }>;
}
```

- Consumes: `PrismaService`, `RedisService`, `IMatchesDbService.getOneMatch` (for `getMatchDate`), `IRecipientsDbService.findOrCreateForUser(userId, name, tx)`, `CACHE_KEYS.invalidateSales`.
- `createSale` behaviour: one `prisma.$transaction(async (tx) => ...)`. Inside: `tx.sales.create` with `userId`, `matchId`, `listedPrice`, `profit`, `invest`, `nbTickets` (sum of allocations, same `sumTickets` helper pattern as the sales db), `status` (Prisma `SaleStatus`), `soldAt: new Date()` only when status is SOLD, nested `Allocations.create`; select `id`. When status is GIFTED: resolve the recipient via `recipientId` or `findOrCreateForUser(..., tx)` then `tx.gifts.create({ saleId, saleStatus: SaleStatus.GIFTED, recipientId, giftedAt: new Date() })`. After the transaction resolves, invalidate the sales cache pattern. Return the brand-cast `id` (cast here, this is the ORM boundary). No `sale_histories` row. No P2025 handling: nothing here updates an existing row.
- `status` type: `'PENDING' | 'SOLD' | 'GIFTED'` mapped to `SaleStatus` inside the db.
- Absent `listedPrice`, `profit` or `invest` become `0` here, at the ORM boundary, via `0 as ListedPrice` / `0 as Profit` / `0 as Invest` (the only place the zero brand cast lives; `CreateSaleDto` does not inherit `AddSaleDto`'s `invest = 0` initialiser through `OmitType`, so the db default is required). Add a db test for each default.

- [ ] **Step 1: Write the failing spec** with `mockDeep<PrismaService>`, `mockTransaction()` helper copied from `delete-sale.usecase.db.spec.ts`, mocked `RedisService`, `IMatchesDbService`, `IRecipientsDbService`. Describes: "getMatchDate" (when the match exists returns its date; when missing returns null); "createSale" nested: "when the status is PENDING" (creates once with status PENDING, no `soldAt`, nested allocations, nbTickets summed, no gift write, sales cache invalidated, returns id), "when the status is SOLD" (`soldAt` is a Date), "when the status is GIFTED" (`gifts.create` called after `sales.create` with the new sale id, `saleStatus` GIFTED; recipient resolved on the same `tx`; `recipientId` returned; stores the passed price and profit including 0), "when the gift write fails" (rejects, cache not invalidated).
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/api/sales/usecases/create-sale/create-sale.usecase.db.spec.ts`
- [ ] **Step 3: Implement** `CreateSaleUsecaseDb` (`@Injectable`, constructor `private readonly prisma`, `redisService`, `matchesDbService`, `recipientsDbService`; explicit return types; `Logger` not needed).
- [ ] **Step 4: Run, expect PASS.** Stage.

---

### Task 5: Create usecase and module

**Files:**
- Create: `src/api/sales/usecases/create-sale/create-sale.usecase.ts`
- Create: `src/api/sales/usecases/create-sale/create-sale.usecase.module.ts`
- Test: `src/api/sales/usecases/create-sale/create-sale.usecase.spec.ts`

**Interfaces:**
- Produces: `abstract class ICreateSaleUsecase { abstract execute(userId: UserId, payload: CreateSaleDto): Promise<{ id: SaleId }>; }` and `CreateSaleUsecase` (constructor `db: ICreateSaleUsecaseDb`, `saleAllocationsValidator`, `giftRecipientResolver`, `salesCacheInvalidator`, all `private readonly`).
- Module mirrors `UpdateSaleUsecaseModule`: imports `PrismaModule, RedisModule, MatchesDbModule, SeasonPassesDbModule, RecipientsDbModule`; providers `{ provide: ICreateSaleUsecaseDb, useClass: CreateSaleUsecaseDb }`, `{ provide: ICreateSaleUsecase, useClass: CreateSaleUsecase }`, `SaleAllocationsValidator`, `GiftRecipientResolver`, `SalesCacheInvalidator`; exports `ICreateSaleUsecase`.

`execute` flow (private helpers keep each function small):

1. `status = payload.status ?? 'PENDING'`.
2. `assertPriceRules(status, payload)`: PENDING or SOLD with `listedPrice == null` throws `SALE_LISTED_PRICE_REQUIRED`. `recipientName != null` with status other than GIFTED throws `SALE_GIFT_RECIPIENT_NOT_APPLICABLE`.
3. For GIFTED: `recipient = await giftRecipientResolver.resolveNew(userId, { recipientName })` (blank throws `SALE_GIFT_RECIPIENT_REQUIRED`). Resolve before any db write; a name only becomes a recipient row inside the db transaction.
4. `await saleAllocationsValidator.validate(userId, payload.matchId, payload.allocations)`.
5. If status is not PENDING: `matchDate = await db.getMatchDate(matchId)`; null throws `MATCH_NOT_FOUND`; `assertNotAfterKickoff(matchDate, null, status)`.
6. Values: pass `listedPrice` and `invest` through as sent (possibly `undefined`); `profit = payload.listedPrice != null ? computeProfit(payload.listedPrice) : undefined`. No casts in the usecase; the db applies the zero defaults (Task 4).
7. `created = await db.createSale({...})`; then `salesCacheInvalidator.afterWrite(userId, { recipientChanged: status === 'GIFTED' })`; return `{ id: created.id }`.

- [ ] **Step 1: Write the failing spec.** `mockDeep` for db, validator, resolver, invalidator via `Test.createTestingModule`, fixtures from `../../test-support/sales.fixtures`. Describes (nested, one `it` per outcome):
  - "when the status is omitted": creates PENDING, passes computed profit, calls `afterWrite` with `recipientChanged: false`, returns `{ id }`.
  - "when the status is PENDING and the price is missing": rejects `SALE_LISTED_PRICE_REQUIRED`, db not called.
  - "when the status is SOLD": price required, creates with SOLD, guard runs.
  - "when the status is GIFTED": "and no price is sent" (writes 0 price and 0 profit, passes resolved recipient, `afterWrite` with `recipientChanged: true`); "and a price is sent" (stores price and `computeProfit`); "and the recipient name is blank" (rejects `SALE_GIFT_RECIPIENT_REQUIRED`, db not called).
  - "when a recipient name is sent for PENDING or SOLD": rejects `SALE_GIFT_RECIPIENT_NOT_APPLICABLE`.
  - "when the match has kicked off": SOLD rejects `SALE_AFTER_KICKOFF`; GIFTED rejects; PENDING succeeds without loading the match date.
  - "when the match does not exist for a SOLD sale": rejects `MATCH_NOT_FOUND` (validator mock passes, `getMatchDate` returns null).
  - "when the allocations are invalid": validator rejection propagates, db not called.
  - "when the write fails": error propagates, `afterWrite` not called.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/api/sales/usecases/create-sale/create-sale.usecase.spec.ts`
- [ ] **Step 3: Implement** usecase and module.
- [ ] **Step 4: Run, expect PASS.** Stage.

---

### Task 6: Wire service, controller, interface; delete the old path

**Files:**
- Modify: `src/api/sales/sales.service.ts` (`addSale(userId, payload: CreateSaleDto)` delegates to `createSaleUsecase.execute`; inject `ICreateSaleUsecase`; remove the `saleAllocationsValidator` dependency if no other method uses it, and `getProfit` only if it has no other caller: grep first, it is public on `ISalesService`, so leave it)
- Modify: `src/api/sales/sales.module.ts` (import `CreateSaleUsecaseModule`; drop `SaleAllocationsValidator` provider if the service no longer injects it)
- Modify: `src/api/sales/sales.controller.ts` (`@Body() payload: CreateSaleDto`)
- Modify: `src/api/sales/interfaces/sales.service.interface.ts` (`addSale` takes `CreateSaleDto`)
- Modify: `src/db/sales/sales.db.interface.ts` and `src/db/sales/sales.db.ts` (delete `addSale`; remove now-unused `sumTickets`/imports if nothing else uses them)
- Modify: `src/api/sales/sales.service.spec.ts` (replace the `addSale allocations` describe, lines ~234 to ~300, with one `describe('addSale')` "delegates to the create usecase and returns its result"; allocation-validation cases live in the usecase spec now). Check `sales.db.spec.ts` (if present) for an `addSale` describe and delete it, its coverage moved to Task 4.

- [ ] **Step 1:** Update the service spec first; expect FAIL (`createSaleUsecase` not injected yet).
- [ ] **Step 2:** Make the edits above.
- [ ] **Step 3:** `npx tsc --noEmit`, `npm run lint`, `npx vitest run src/api/sales src/db/sales src/common`, expect clean and PASS. Run the full `npm test` once.
- [ ] **Step 4:** Verify the build still emits `dist/main.js` (`npm run build && test -f dist/main.js`; exit 0 alone is not evidence). Stage.

---

### Task 7: README and tech debt

**Files:**
- Modify: `README.md` line ~199: `POST /sales` description becomes "Create a sale (optional `status`, `recipientName`; `listedPrice` optional for GIFTED)".
- Modify: `docs/tech-debt.md`: add "Un-gifting a price-less gift leaves a PENDING sale at price 0 (PSG-104)": what (gift created without a price stores 0/0; `ungift-sale` returns it to PENDING unchanged), why deferred (ungift usecase out of scope for create), cost (small: require a price on un-gift when stored price is 0, plus web prompt, about 80 lines, two layers so two tickets).

- [ ] **Step 1:** Edit both. Tell the coordinator to file the follow-up as a `PSG-*` Linear issue assigned to the user before declaring ready for `/crit`. Stage.

---

### Task 8: Update PSG-90 spec and plan

The PSG-90 spec and plan were updated in the same planning pass as this plan (see "PSG-90 changes" below). No builder work unless the contract above changes; re-check them when slice B lands.

## PSG-90 changes (already applied to the PSG-90 docs)

Spec `docs/specs/2026-11-22-psg-90-log-sale-live-net-preview-design.md`:
- Header and section 2: no longer "No backend slice"; depends on PSG-104 for the contract.
- Section 2 contract bullets: `POST /sales` accepts `status`, `recipientName`, optional `listedPrice` for GIFTED.
- Section 4.5: rewritten as a single call; two-call text, options A/B, placeholder text removed.
- Section 5: remove "Atomic create with status" from out of scope.
- Section 6 testing: "Gifted uses the placeholder price" becomes "Gifted omits listedPrice".
- Section 7 items 5 and 6 updated.

Plan `docs/plans/2026-11-22-psg-90-log-sale-live-net-preview-plan.md`:
- Global constraints and Architecture: still web only, plus "requires PSG-104 merged".
- Task 3: `GIFT_PLACEHOLDER_PRICE` removed; GIFTED payload omits `listedPrice`; type `CreateSaleInput` is flat.
- Task 4: action is one `POST /sales` call; partial-failure branch and `createdSaleId` removed.
- Task 6 error block: the "Open the sale" link removed.
- Task 8: first tech-debt entry removed (only the two-surfaces entry remains).
- Size table and follow-up list updated.

## Self-review

- Spec coverage: contract (Tasks 3, 5, 6), atomic transaction (Task 4), optional gift price stored 0/0 (Tasks 4, 5), shared invariants (Tasks 1, 2, 5), cache invalidation (Task 5), tech debt (Task 7), PSG-90 consumption (Task 8).
- Names used consistently: `CreateSaleDto`, `ICreateSaleUsecase`, `ICreateSaleUsecaseDb`, `GiftRecipientResolver`, `assertNotAfterKickoff(matchDate, current, target)`, `SALE_LISTED_PRICE_REQUIRED`.
- Known soft spot for the reviewer: Task 6 service constructor trimming depends on a grep of remaining `saleAllocationsValidator` uses.
