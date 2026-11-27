# Tech debt & deferred decisions

Things found while working on something else, deliberately not fixed at the time. Each
entry says what it is, why it was deferred, and what acting on it would cost — so the
decision can be re-taken later with the same information, instead of re-derived.

Add an entry when you find something real but out of scope. Delete it when it's done.


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
