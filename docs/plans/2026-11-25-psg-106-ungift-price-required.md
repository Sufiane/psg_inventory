# PSG-106 Require a price when un-gifting a price-less gift: implementation plan

Spec: `docs/specs/2026-11-25-psg-106-ungift-price-required-design.md`

**Goal:** un-gifting a price-less gift requires an operator-supplied price; plus four PSG-104
review cleanups.

**Architecture:** backend only. Usecase `ungift-sale` takes an optional price; CLI gets
`--price`. Five independent tasks, one commit each. Follow `~/.claude/CLAUDE.md` rules: explicit
return types, no single-letter names, braces, blank line before `if/return/throw`, readonly
constructor params, snake_case error codes, no barrels, no comments unless a non-obvious why,
nested `describe` per condition, TDD (failing test first, then implement).

## Split and size

No split: one PR, about 350 lines, backend only, one actor. Tasks 1-5 touch disjoint files except
Task 3 and Task 5 (both edit `create-sale.usecase.db.ts`) and Task 4 and Task 5 (both touch
`update-sale.usecase.db.ts` only via Task 5). Run in order 5, 4, 3, 2, 1 or any order that does
not parallelise 3 and 5.

| Task | Item | Est. lines (with tests) |
|---|---|---|
| 1 | Price required on un-gift (usecase, db, service, CLI, docs) | 170 |
| 2 | Best-effort cache invalidation on create | 70 |
| 3 | Usecase decides create defaults | 50 |
| 4 | Resolver dedupe | 40 |
| 5 | Shared sumTickets | 35 |

## Task 1: price required on un-gift

Files:
- Modify `src/common/exceptions/error-codes.enum.ts`: add `SALE_LISTED_PRICE_NOT_APPLICABLE =
  'sale_listed_price_not_applicable'`. Check whether the controller/exception filter maps codes
  to HTTP statuses and add the mapping if one exists.
- Modify `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.ts` and `.spec.ts`.
- Modify `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.ts`, `.db.spec.ts`,
  `.db.int-spec.ts`.
- Modify `src/api/sales/interfaces/sales.service.interface.ts` and `sales.service.ts` (and its
  spec if it asserts the call args).
- Modify `scripts/ungift-sale.ts`.
- Modify `docs/tech-debt.md`: remove the "Un-gifting a price-less gift" section.

Steps:
- [ ] 1. Usecase spec, failing first. Cases, one `describe` each:
  - stored price 0, no price: rejects `SALE_LISTED_PRICE_REQUIRED`, db `ungiftSale` not called.
  - stored price 0, price 120: calls db `ungiftSale` with `{ listedPrice: 120, profit:
    computeProfit(120) }` as the new write.
  - stored price 90, price 120: rejects `SALE_LISTED_PRICE_NOT_APPLICABLE`.
  - stored price 90, no price: calls db with no price write (existing test stays green).
- [ ] 2. Implement in the usecase: signature `execute(userId, saleId, price?: ListedPrice)`;
  after the GIFTED check, `this.assertPriceRule(existing.listedPrice, price)` (private,
  `logger.warn` before each throw, per CLAUDE.md); pass `price == null ? undefined : { listedPrice:
  price, profit: computeProfit(price) }` as a new `pricing` argument. Add `Logger` to the class.
- [ ] 3. Db: add optional `pricing?: { listedPrice: ListedPrice; profit: Profit }` param to
  `ungiftSale`; in the existing `tx.sales.update` data, spread `...pricing`. Unit spec asserts the
  update data with and without pricing. History create is untouched (pre-write row).
- [ ] 4. Int-spec: price-less gift (`listedPrice 0`) un-gifted with price 100 ends PENDING,
  `listedPrice 100`, `profit computeProfit(100)`, history row 0/0.
- [ ] 5. Thread the optional `price` through `ISalesService.ungiftSale` and `SalesService`.
- [ ] 6. CLI `scripts/ungift-sale.ts`: parse `--price <n>` from `process.argv` before boot
  (extract `parsePriceArg(rawArgs): ListedPrice | undefined`, a top-level function; positive
  integer else usage error and exit 1; strip it and its value from the positional ids filter).
  After loading the sale, if `sale.listedPrice === 0` and no price, print `error: sale has no
  price; re-run with --price <whole euros>` and exit 1 (before the confirmation gate). Print the
  price being applied in the "about to un-gift" block. Map the two new price error codes to
  friendly messages next to the existing `SALE_INVALID_STATUS_TRANSITION` handler. Update USAGE.
- [ ] 7. Remove the tech-debt entry.
- [ ] 8. Commit: `feat(sales): require a price when un-gifting a price-less gift`.

## Task 2: best-effort cache invalidation on create

Files: `src/api/sales/shared/sales-cache.invalidator.ts` + new `.spec.ts`;
`create-sale.usecase.ts`, `create-sale.usecase.db.ts`, `create-sale.usecase.module.ts` and their
specs.

Steps:
- [ ] 1. Invalidator spec, failing first: when Redis rejects on any pattern, `afterCreate`
  resolves; when Redis works, it invalidates sales (`CACHE_KEYS.invalidateSales`), accounting,
  and recipients only if `recipientChanged`.
- [ ] 2. Add `afterCreate(userId, { recipientChanged })` using a private
  `invalidateQuietly(label, operation): Promise<void>` that try/catches and `logger.warn`s with
  the user id and snake_case label. Add `Logger`.
- [ ] 3. Create usecase calls `afterCreate` (replaces `afterWrite`); create usecase spec: when
  invalidator mock is made to resolve after a Redis-style failure inside it, `execute` still
  returns the id.
- [ ] 4. Remove `RedisService` and `CACHE_KEYS` from `CreateSaleUsecaseDb`, its spec, and the
  `RedisModule` import from the module only if nothing else there needs it (the invalidator
  still does: keep it).
- [ ] 5. Commit: `fix(sales): make cache invalidation best-effort after create`.

## Task 3: usecase decides create defaults

Files: `create-sale.usecase.ts`, `create-sale.usecase.db.ts`, both specs.

Steps:
- [ ] 1. Specs, failing first: usecase passes `{ listedPrice: 0, profit: 0, invest: 0 }` to the
  db for a price-less gift; passes computed values when a price is given. Db spec: values are
  written as given (no defaulting).
- [ ] 2. `CreateSaleWrite`: `listedPrice`, `profit`, `invest` become required (drop `?` and
  `| undefined`). Remove the three `?? (0 as ...)` casts in the db.
- [ ] 3. Usecase: module-level `const NO_PRICE = 0 as ListedPrice`, `NO_PROFIT = 0 as Profit`,
  `NO_INVEST = 0 as Invest`; build the three values in a private `resolveAmounts(payload)`.
- [ ] 4. Commit: `refactor(sales): decide create defaults in the usecase`.

## Task 4: gift recipient resolver dedupe

Files: `src/api/sales/shared/gift-recipient.resolver.ts` (spec unchanged, must stay green).

Steps:
- [ ] 1. Extract private `resolveGiven(userId, payload): Promise<GiftRecipientInput | null>`
  (id with `assertOwnedRecipient`, else normalised non-empty name, else `null`).
- [ ] 2. `resolveNew`: `const given = await this.resolveGiven(...)`; throw
  `SALE_GIFT_RECIPIENT_REQUIRED` on `null`. `resolveExisting`: `return given ?? undefined`.
- [ ] 3. Run the resolver spec unchanged. Commit: `refactor(sales): share parsing in gift recipient resolver`.

## Task 5: shared sumTickets

Files: new `src/api/sales/shared/sum-tickets.util.ts` + `.spec.ts`;
`create-sale.usecase.db.ts`, `update-sale.usecase.db.ts`.

Steps:
- [ ] 1. Spec first: sums `nbTickets` across allocations; empty list gives 0.
- [ ] 2. Move the function (exported, explicit return type `TicketCount`); delete both local
  copies and import it.
- [ ] 3. Commit: `refactor(sales): share sumTickets between create and update dbs`.

## Final verification (qa-verifier)

Unit specs for `src/api/sales`, int-spec for ungift, `npm run lint`, `npm run lint:deps`,
`npm run build` plus `test -f dist/main.js`. Stage the changes and stop for `/crit`; do not
commit before review per the user's git workflow if the builder is not committing per task
(the per-task commits above are conventional-commit messages for the builder to use once the
user has allowed committing).
