# Tech debt & deferred decisions

Things found while working on something else, deliberately not fixed at the time. Each
entry says what it is, why it was deferred, and what acting on it would cost — so the
decision can be re-taken later with the same information, instead of re-derived.

Add an entry when you find something real but out of scope. Delete it when it's done.


## Cognitive-complexity ratchet sits at 27, not the target 15 (PSG-49)

`sonarjs/cognitive-complexity` is set to the current worst function (27) so the gate
passes today and blocks anything worse. Two functions are above the target of 15:
`resolveDraftRows` (27) and `validateCommitRows` (23) in `sales-import.resolver.ts`.
`UpdateSaleUsecase.execute` was brought under 15 in PSG-50. Deferred because splitting
them is a refactor of hardened, well-tested code. Acting costs one extraction pass per function, then lowering
the threshold in `eslint.config.mjs`.


## Edit drawer shows pre-invest profit while rows show net (PSG-87)

Sales table rows now show net (`profit - invest`, PSG-82). The edit drawer in
`web/src/routes/(app)/sales/+page.svelte` still renders `editSale.profit` in the SOLD
summary, the Mark sold button and the revert confirmation, so a row and its drawer can
disagree. Deferred because the drawer was out of scope for the Sales page redesign. Acting
costs swapping three spots to `saleNet(editSale)` and relabelling.

## All-seasons sales list is unbounded (PSG-85)

`GET /sales` returns every sale with allocations and gift joined, no pagination, and the
Sales page "All seasons" tab now loads it in one call. Deferred because the page totals
and tab counts are computed client-side over the full list, so paging needs server
aggregates; payload is about 100-200 KB after several seasons. Acting costs backend
pagination plus an aggregate endpoint, plus web changes (two tickets). Trigger: p95 payload
over about 1 MB or a user with thousands of sales.

## Un-gifting a price-less gift leaves a PENDING sale at price 0 (PSG-104)

A gift created through `POST /sales` without a price stores `listedPrice = 0` and
`profit = 0`. `ungift-sale` returns a sale to PENDING unchanged, so the result is a PENDING
sale at price 0 that nothing forces the user to price. Deferred because the un-gift usecase
is out of scope for atomic create. Acting costs requiring a price on un-gift when the stored
price is 0, plus a web prompt: about 80 lines across two layers, so two tickets.
