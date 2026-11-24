# PSG-104 Atomic create sale with status and optional price for gifts: design

Layer: backend only, one actor (athlete). No schema change, no Prisma migration.
Blocks PSG-90 (Log sale web form), which today works around the gap with two calls and a
placeholder gift price.

## 1. Problem

`POST /sales` creates only PENDING sales and requires `listedPrice >= 1`. To log a SOLD or
GIFTED sale the web must call `POST /sales` then `POST /sales/update`. If the second call
fails a PENDING sale is left behind. A gift also needs a made-up price (placeholder 1), which
stores a 0.88 profit on a sale that produced no cash.

## 2. Findings from the code

- `SalesService.addSale` validates allocations, then `ISalesDbService.addSale` does one
  `sales.create` (status PENDING, nested allocations) and invalidates the sales cache.
  No usecase, no transaction needed today.
- `UpdateSaleUsecase` owns the invariants: kickoff guard (`assertNotAfterKickoff`,
  `isKickoffGuarded`: entering SOLD or GIFTED after kickoff is `sale_after_kickoff`), recipient
  resolution (`resolveNewGiftRecipient` + `assertOwnedRecipient`, name normalised with
  `normalizeRecipientName`, blank is `sale_gift_recipient_required`), cache invalidation
  (`SalesCacheInvalidator.afterWrite`). `UpdateSaleUsecaseDb.applySaleWrite` sets `soldAt` on
  entry into SOLD; `giftSale` writes status first, then `gifts.create`, because the composite
  FK `(sale_id, sale_status)` needs the sale already GIFTED. Gift recipient find-or-create runs
  on the same `tx` so a rollback removes a new recipient too.
- `Sales.listedPrice` is `Int NOT NULL`, `Sales.profit` is `Float NOT NULL`. No nullable column
  exists and none is needed (see D3).
- Existing gifts made through update-sale keep whatever price and profit the PENDING sale had
  (`enter_gift` only patches them if the payload sends a price). Accounting counts GIFTED
  inside `unrealized`, with `gifted` as its subset, summing stored `profit` and `listedPrice`.
- `AddSaleDto` is also the base of `UpdateSaleDto` (`PartialType(AddSaleDto)`), so widening it
  in place would leak into the update contract.
- `ISalesDbService.addSale` is called only by `SalesService.addSale`.

## 3. Contract

`POST /sales` body (new `CreateSaleDto`):

| Field | Type | Rule |
|---|---|---|
| `matchId` | string | required, as today |
| `allocations` | `{ seasonPassId, nbTickets }[]` | required, min 1, as today |
| `invest` | number | optional, `>= 0`, default 0, as today |
| `listedPrice` | number | optional; `>= 1` when sent. Required when status is PENDING or SOLD. |
| `status` | `PENDING \| SOLD \| GIFTED` | optional, default `PENDING` |
| `recipientName` | string, max 120 | required (non-blank after normalisation) when `GIFTED`; refused otherwise |

Response unchanged: `{ id: string }`. Errors are `DomainException` codes mapped to HTTP:

- `sale_listed_price_required` (400, new): PENDING or SOLD without `listedPrice`.
- `sale_gift_recipient_required` (400, existing): GIFTED with blank `recipientName`.
- `sale_gift_recipient_not_applicable` (400, existing): `recipientName` sent with PENDING or SOLD.
- `sale_after_kickoff` (400, existing): SOLD or GIFTED and the match has kicked off.
- `match_not_found`, `sale_invalid_allocations`, `sale_allocation_pass_mismatch`: as today.
- DTO validation (class-validator 400) for a status outside the three values, price below 1.

CANCELLED is not creatable (the DTO has no such value), same as update.

## 4. Design decisions

D1. Create gets its own usecase, `sales/usecases/create-sale/`, with its own
`create-sale.usecase.db.ts`. Reason: three intents (pending, sold, gifted), non-trivial rules,
a transaction. Call direction stays controller, `SalesService.addSale` (thin delegate),
usecase, usecase db. PENDING creates go through it too, so there is one create path.
`ISalesDbService.addSale` is deleted (dead code afterwards); its test coverage moves to the
usecase spec.

D2. Create the sale directly in its final status, in one `$transaction`. There is no
create-then-transition: `sales.create` with `status`, `soldAt` (when SOLD) and nested
allocations; when GIFTED, `gifts.create` follows in the same transaction, which satisfies the
composite FK because the sale row is already GIFTED. Any failure rolls back everything,
including a recipient created on the same `tx`. No partial state exists.

D3. Gift without a price stores `listedPrice = 0` and `profit = 0`. Both columns accept 0, so
no migration. This is consistent with update-sale in the way that matters: stored values are
whatever the caller supplied, and a gift created with a price (API allows it, `>= 1`) stores
`listedPrice` and `computeProfit(listedPrice)` exactly like `enter_gift` does. A gift created
without one has no forgone price to record. Consequence: a price-less gift contributes 0 to
the accounting `gifted` subset's listed value and profit; its `invest` still counts. This is
the intended meaning ("no placeholder, no 0.88").

D4. Invariants are shared by extraction, not copied:
  - `sales/shared/sale-kickoff.guard.ts`: `assertNotAfterKickoff(matchDate, current, target)`
    and `isKickoffGuarded`, moved out of `update-sale.usecase.ts`. `current` is
    `RawSaleStatus | null`; create passes `null` (nothing before, so SOLD and GIFTED are both
    guarded). Update passes `existing.status`. Behaviour of update is unchanged, including
    GIFTED to GIFTED being exempt.
  - `sales/shared/gift-recipient.resolver.ts`: injectable `GiftRecipientResolver` owning
    `resolveNew` (recipient id ownership check or normalised name, blank is required error)
    and `resolveExisting`, moved out of `UpdateSaleUsecase`. Depends on
    `IRecipientsDbService` (no ORM import). Create uses `resolveNew` with
    `{ recipientName }`.
  - `SaleAllocationsValidator` and `SalesCacheInvalidator` are already shared; create reuses
    them. `afterWrite` is called for every create (`recipientChanged` is true for GIFTED), a
    superset of what `addSale` invalidated, so accounting caches now also clear on create.
  - Not shared: the `soldAt = now` rule. It is one line inside the create db; update's lives
    in the private `applySaleWrite`. Extracting it would mean reworking hardened code for a
    one-liner. Covered by a db test.
  - Not applicable: `assertLegalTransition` (a new sale has no current status; all three
    targets are legal).

D5. Usecase db: no shortcut. `CreateSaleUsecaseDb` is self-contained: its own `$transaction`
with `sales.create` and `gifts.create`, `getMatchDate(matchId)` passthrough for the kickoff
guard, and tx-bound recipient find-or-create via the already injected
`IRecipientsDbService.findOrCreateForUser(userId, name, tx)` (the same collaboration
`UpdateSaleUsecaseDb` has). It does not touch the update db's private helpers. The interim
"narrow interface over the shared db class" shortcut from the global convention is not
needed here.

D6. Error order in `execute`: cheap field rules first (price required, recipient applicability
and presence), then `SaleAllocationsValidator.validate` (also raises `match_not_found`), then
the kickoff guard (loads the match date only when status is not PENDING), then the write.

D7. No `sale_histories` row on create. History records the prior snapshot before a change;
a new row has none. (The two-call flow produced one PENDING snapshot as a side effect; nothing
reads it for a brand-new sale.)

D8. `recipientId` is not accepted on create (ticket asks for `recipientName` only; the web form
sends a name). The shared resolver already supports ids, so adding it later is a DTO field plus
tests.

D9. `CreateSaleDto` is a new class built with `OmitType(AddSaleDto, ['listedPrice'])` plus
`listedPrice`, `status`, `recipientName`, so `UpdateSaleDto` is untouched. `SaleStatusTarget`
is imported from `update-sale.dto.ts`.

## 5. Known edge (follow-up ticket, not absorbed)

Un-gifting a price-less gift (`ungift-sale`) returns it to PENDING with `listedPrice = 0`,
`profit = 0`. Editing it later requires a price (update DTO `>= 1` when sent) but nothing forces
one. Follow-up: make un-gift of a zero-price sale surface the price field, or refuse until a
price is supplied. Logged in `docs/tech-debt.md` with a Linear ticket.

## 6. Ticket split and size

Hard cap 800 lines per PR. Total estimate about 880 including tests and docs, so split. Both
slices are backend, athlete actor, mergeable alone.

| Slice | Content | Est. lines | Depends on |
|---|---|---|---|
| A | Extract kickoff guard and `GiftRecipientResolver` from update-sale (pure refactor, update behaviour unchanged) + specs | ~260 | none |
| B | `CreateSaleDto`, create usecase + db + module, service/controller wiring, delete `ISalesDbService.addSale`, error code, README row, tech-debt entry, PSG-90 doc updates + specs | ~620 | A |

Web slice PSG-90 depends on B (blocked-by). Follow-up tickets: (1) un-gift of price-less gift
(section 5); (2) accept `recipientId` on create if a future form needs it (only if wanted).

## 7. Testing

Vitest (`vitest-mock-extended`, as the sibling usecase specs), nested `describe` per condition, short `it` titles.

- Guard: when target is SOLD, GIFTED, PENDING; when current is null, PENDING, GIFTED; when
  kickoff passed vs future.
- Resolver: when an id is given (owned, not owned); when a name is given (normalised, blank);
  `resolveExisting` blank means keep.
- Usecase: per status (PENDING, SOLD, GIFTED); when price missing (PENDING, SOLD refuse,
  GIFTED stores 0/0); when GIFTED with price (computes profit); recipient required and not
  applicable; after kickoff (SOLD, GIFTED refuse, PENDING allowed); allocations invalid;
  cache invalidation called with `recipientChanged` true only for GIFTED, not called on
  failure.
- Db (mocked `PrismaService` with a `mockTransaction` helper, as sibling `*.usecase.db.spec.ts`):
  SOLD sets `soldAt`; GIFTED calls `gifts.create` after `sales.create` inside one
  `$transaction` and resolves the recipient on the same `tx`; when `gifts.create` rejects the
  error propagates and no cache invalidation runs; PENDING has `soldAt` unset. Real rollback is
  Postgres behaviour and is not re-tested.
- Update usecase and its 1000-line spec stay green with only a provider swap (real resolver
  built on the mocked recipients db).

## 8. Out of scope

Web changes (PSG-90). Un-gift behaviour. `recipientId` on create. Schema or migration.
Cognitive-complexity ratchet (new `execute` must stay under 27, aim under 15 by small
private helpers).
