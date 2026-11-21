# PSG-85: all-seasons sales on the Sales page

## Problem

PSG-79 made "All seasons" on the Sales page a web-side fan-out: `+page.server.ts` calls
`/sales/season/:y` once per season returned by `seasonOptions(new Date(), 6)`. Seasons older
than six back never appear, and every "All seasons" load costs six API round trips.
The ticket asks for `GET /sales/all` and a swap of the fan-out for that call.

## Finding: the endpoint already exists

`GET /sales` (`SalesController.getSales` -> `SalesService.getSales` -> `SalesDb.getSales`)
already returns every sale of the authenticated user in `FormattedSale[]` shape:

- no date filter, ordered by `Match.date asc`, same `saleQuery` include as the season routes;
- already behind the service/db split, already Redis-cached under `CACHE_KEYS.sales(userId)`
  with `ONE_HOUR_TTL`;
- already invalidated by every write path through `CACHE_KEYS.invalidateSales(userId)`
  (`user:id:{id}:sales*`, which matches the bare `sales` key): `addSale`, update, delete,
  ungift usecases, sales import, admin, and the match-date-change flush in `matches.db.ts`;
- covered by `sales.service.spec.ts` (`getSales`).

Nothing in `src` or `web` calls it today, which is why the gap looked real.

## Decision (needs coordinator/user sign-off, see Alternatives)

**Do not add `/sales/all`. Point the web load at the existing `GET /sales`.**
Adding `/sales/all` would be a second route to the same service method: duplicate surface,
duplicate tests, two names for one thing, no behavioural gain. The ticket's done-when is
satisfied by the existing endpoint:

- "endpoint returns sales from all seasons": yes, no date bound.
- "Sales load uses it instead of six parallel calls": web change below.
- "older than six back show up": yes, the query is unbounded.

Pushback on the ticket wording, not on its intent. If the route name `/sales/all` matters
(e.g. external consumers, API docs), see Alternative B.

## Design

### Backend

No change. One review-time check only: confirm `GET /sales` is not excluded by a global
route guard/throttle that the season routes are not (same controller, same `@User()`, so
none expected).

### Web (`web/src/routes/(app)/sales/+page.server.ts`, load only)

Replace the `season === 'all'` branch:

```
sales = await api<SaleListItem[]>(event, '/sales');
```

Remove the now-unused `seasonOptions` import. `year` stays `null`, `canCreate`, actions and
every other branch are untouched. Ordering needs no work: the page sorts client-side via
`sortSales` in `$lib/sales-view`, so the old per-season-chunk order and the new global
`date asc` order are equivalent to the user.

### Route ordering vs `/sales/:id`

Not an issue for the recommended design: `GET /sales` is the bare path, distinct from
`/:saleId`. (For Alternative B only: a literal `@Get('/all')` must be declared before
`@Get('/:saleId')`, like `/grouped` and `/current-season` already are, else `all` is
captured as a sale id and `GetSaleDto` rejects it.)

### Caching and invalidation

One entry per user, key `user:id:{userId}:sales`, TTL 1 hour, same read-through as the
season routes (`redisService.get(key, ttl, loader)`). Because the key is under the
`user:id:{id}:sales` prefix, the existing pattern invalidation already flushes it on any
write; no new key builder, no new invalidation call, no `CacheKey` type change.
Consequence to accept: the all-seasons list and the per-season lists are cached
separately, so a cold "All seasons" load costs one DB query and one cache entry, and a write
re-warms each independently on next read. Cheaper than six cold season reads.

### Auth and ownership scoping

Unchanged: global auth guard, `@User()` supplies `user.id`, `SalesDb.getSales` filters
`where: { userId }`. No cross-user path; the cache key embeds the user id.

### Response size

Unbounded list of sales with `Allocations` and `Gift` joined. Estimate: tens of sales per
season, roughly 0.5 KB each, so a few hundred sales is on the order of 100-200 KB uncompressed
after several seasons. Acceptable now. Not adding pagination: the Sales page computes totals
and tab counts over the full list client-side, so paging would force server-side aggregates
(new feature). Revisit trigger: p95 payload over ~1 MB or a user with thousands of sales;
record in `docs/tech-debt.md` as a deferred entry (why deferred, cost: pagination plus
server-side totals, a backend plus web ticket pair) instead of a footnote. Confirm gzip/brotli
is on at the Railway edge when picking up that entry.

## Alternatives considered

- **A (recommended): reuse `GET /sales`.** ~10 changed lines, web only.
- **B: add `GET /sales/all` as an alias** delegating to `salesService.getSales`. ~25 lines
  (controller route declared above `/:saleId`, one controller-level test), same cache. Only
  worth it if the name is a public contract. Costs a duplicate route to maintain.
- **C: new `getAllSeasonSales` with its own cache key.** Rejected: duplicates `getSales`
  exactly, adds an invalidation target (though `sales*` would cover it).

## Out of scope / follow-ups

- Payload-growth entry in `docs/tech-debt.md` (above).
- Edit-drawer net-profit mismatch is PSG-87, untouched.
- Remove or keep `GET /sales/season/:y`: still used by the single-season, non-current path.

## Testing

- No backend change, so no new backend test; `sales.service.spec.ts` already covers
  `getSales`.
- Web: the loader has no unit harness today and the change is one call swap. Gate is
  `npm run check` and `npm run lint` in `web`, plus a manual or e2e check of
  `/sales?year=all`. If `e2e/` has a sales spec, extend it per
  the testMatch rule in memory (new spec files must be listed in
  `e2e/playwright.config.ts`).
