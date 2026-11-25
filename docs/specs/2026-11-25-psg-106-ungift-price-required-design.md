# PSG-106 Require a price when un-gifting a price-less gift: design

Layer: backend only (plus an operator CLI script), one actor (operator). No schema change, no
migration, no web change.

## 1. Problem

A gift created through `POST /sales` without a price (PSG-104) stores `listedPrice = 0` and
`profit = 0`. `UngiftSaleUsecase` returns a sale to PENDING unchanged, leaving a PENDING sale at
price 0 that nothing forces anyone to price. Four low-severity findings from the PSG-104 review
ride along.

## 2. Findings from the code

- Un-gift is not an HTTP endpoint. `SalesController` does not expose it (GIFTED is terminal in
  the app, spec D5). Its only caller is `scripts/ungift-sale.ts` (`npm run ungift -- <userId>
  <saleId> --yes`), via `ISalesService.ungiftSale` and `UngiftSaleUsecase.execute`. So "require
  a price on un-gift" is a CLI argument, and there is no web surface to prompt in. The
  `docs/tech-debt.md` entry assumed "a web prompt, two tickets"; that is wrong. This is one
  layer, one ticket.
- `ErrorCode.SALE_LISTED_PRICE_REQUIRED` (`sale_listed_price_required`) already exists with
  exactly this meaning.
- Prices are whole euros, `>= 1` (PSG-98). Profit is `computeProfit(price)` from
  `sales/shared/profit.util.ts`.
- `UngiftSaleUsecaseDb.ungiftSale` runs one transaction (delete gift row, set PENDING, write
  history) then invalidates four cache namespaces itself.
- `CreateSaleUsecaseDb.createSale` defaults price, profit and invest with blind casts
  (`?? (0 as ListedPrice)`), and invalidates the sales cache itself after commit. The usecase
  then calls `SalesCacheInvalidator.afterWrite` (accounting, recipients). Any Redis throw after
  commit returns 500 for a saved sale; a client retry creates a duplicate.
- `GiftRecipientResolver.resolveNew` and `resolveExisting` repeat: id branch with ownership
  check, then name normalisation. They differ only in what a blank name means.
- `sumTickets` is copy-pasted in `create-sale.usecase.db.ts` and `update-sale.usecase.db.ts`.

## 3. Decisions

D1. Error code: reuse `SALE_LISTED_PRICE_REQUIRED`. No new code for the required case.

D2. Contract: `UngiftSaleUsecase.execute(userId, saleId, price?: ListedPrice)`, threaded through
`ISalesService.ungiftSale`. Rules, after the existing not-found and not-GIFTED checks:
- stored `listedPrice === 0` and no price given: throw `SALE_LISTED_PRICE_REQUIRED`.
- stored `listedPrice === 0` and price given: write `listedPrice = price`,
  `profit = computeProfit(price)` in the same transaction as the status reset.
- stored `listedPrice > 0` and price given: throw new `SALE_LISTED_PRICE_NOT_APPLICABLE`
  (`sale_listed_price_not_applicable`). The command must never silently overwrite a real price,
  and must not silently ignore an argument the operator typed.
- stored `listedPrice > 0` and no price: unchanged behaviour.

D3. History entry keeps capturing the pre-write row (price 0, profit 0), as today.

D4. CLI: optional `--price <n>`. Parsed and validated before the app boots (positive integer,
else usage error exit 1). When the loaded sale has price 0 and no `--price` was given, print the
required-price message and exit 1 before the confirmation gate. `SALE_LISTED_PRICE_REQUIRED` and
`SALE_LISTED_PRICE_NOT_APPLICABLE` from the usecase are mapped to friendly stderr messages,
like `SALE_INVALID_STATUS_TRANSITION` today. The cron note about nightly auto-cancel stays.

D5. Redis after commit (create only): invalidation becomes best-effort. The create usecase db
stops touching Redis. `SalesCacheInvalidator` gains `afterCreate(userId, { recipientChanged })`
that invalidates sales, accounting and (when a gift) recipients, each wrapped so a failure is
logged with `logger.warn` and swallowed. Cache TTLs (jittered `EX`) bound staleness. The
existing `afterWrite` used by update and the un-gift db stay as they are: out of scope, listed
as a follow-up (same failure mode exists there).

D6. Defaults decided by the usecase: `CreateSaleWrite` makes `listedPrice`, `profit`, `invest`
required. The usecase computes `listedPrice ?? 0`, `profit` (`computeProfit` or 0) and
`invest ?? 0`, using two module-level constants for the branded zero. The db passes values
straight through with no casts. (Branded zero cast lives in the usecase file because there is no
money constructor module yet; adding one is not worth it for this.)

D7. Resolver dedupe: extract one private `resolveGiven(userId, payload)` returning
`GiftRecipientInput | null` (id with ownership check, else normalised non-empty name, else
`null`). `resolveNew` throws `SALE_GIFT_RECIPIENT_REQUIRED` on `null`; `resolveExisting`
returns `undefined` on `null`. Public behaviour unchanged.

D8. `sumTickets` moves to `sales/shared/sum-tickets.util.ts` with its own spec; both dbs import
it and drop their copies.

D9. `docs/tech-debt.md`: delete the PSG-104 un-gift entry once D2 and D4 land.

## 4. Testing

- Usecase unit specs for all four D2 branches (nested `describe` per condition).
- Ungift db spec: price branch writes price and profit; no-price branch unchanged.
- Ungift int-spec: end to end with a price-less gift, asserts row ends PENDING at the given
  price with `computeProfit` profit, and history holds the old 0/0.
- `SalesCacheInvalidator` spec: Redis rejects, `afterCreate` resolves and logs.
- Create usecase spec: Redis failure after create still returns the id; defaults computed in the
  usecase. Create db spec: no Redis dependency.
- Resolver spec stays as is (behaviour preserved) and must pass unchanged.
- `sum-tickets.util` spec.

## 5. Size and tickets

About 350 lines including tests, all backend, one actor. Fits one PR under the 800 cap. One
ticket, as five commits (one per item). No split recommended.

## 6. Open questions

Q1. D2 `sale_listed_price_not_applicable` as a new code (recommended) versus silently ignoring
or overwriting. Default in this spec: new code.
Q2. D5 scope: create path only (recommended; matches the finding) versus also making update and
un-gift invalidation best-effort. Default: create only, follow-up ticket for the rest.
Q3. Ticket scope: keep all four review findings inside PSG-106 (recommended; each is tiny and
all sit in the same files) versus splitting them to their own tickets.
