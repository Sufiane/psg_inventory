# PSG-77 expose matchId on FormattedSale (design)

## Problem

`FormattedSale` omits `matchId`, so sales payloads (`GET /sales`, `/sales/current`,
`/sales/grouped`, `/sales/season/:year`, `/sales/match/:matchId`) cannot be joined to
fixtures by the Matches and Accounting pages. Ticket cites "plan slice S0" of a redesign
plan; no such plan exists in `docs/plans/` or `docs/specs/`;
Treated as a standalone additive change.

## Design

- `FormattedSale` keeps `matchId` instead of omitting it: `Omit<Sale, 'Match' | 'userId'>`.
  `Sale.matchId` is already `MatchId` (branded via `Override` in `sale.type.ts`), so no
  new brand and no new cast.
- `SalesService.formatSale` stops stripping `matchId`: `omit(sale, ['Match', 'userId'])`.
- Web mirror types gain `matchId: MatchId`: `SaleListItem` and `MatchSale` in
  `web/src/lib/types.ts` (`SaleDetail` already has it). Type-only; neither type is
  constructed anywhere, only deserialized from `api<...>()`.

## Non-changes

- Cache: `sales.db.ts` caches the raw `Sale` rows, which already contain `matchId`;
  `formatSale` runs after the cache read. No key, shape or invalidation change, no
  stale-entry risk, no flush needed.
- No Prisma query, schema, DTO or controller change. `getSale` already returns the raw
  `Sale` including `matchId`.
- No ORM or db-layer change, so the hexagonal split is untouched.

## Decisions taken without asking

1. Missing "slice S0" doc: proceeded on the ticket text alone.
2. Included the two-line web type mirror (the existing `MatchSale` doc comment says it
   mirrors `FormattedSale`); leaving it out would let the types drift.
3. Additive wire change, no API versioning: only the first-party web app consumes it.

## Testing

- `src/api/sales/sales.service.spec.ts`: assert `matchId` present on formatted output.
- Web: `npm run check` type-check only.
