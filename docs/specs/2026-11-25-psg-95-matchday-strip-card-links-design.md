# PSG-95 Matchday strip cards link to the match page

## Problem

Cards in the accounting matchday strip (`web/src/lib/ui/MatchdayStrip.svelte`) are inert `<li>`
elements. A user who sees a pending or break-even card has no way to jump to that match.

## Decisions on the ticket's open questions

1. **Target: the match detail page `/matches/[matchId]`, not a filtered sales list.**
   - The page exists and already renders `MatchInspector`: match header, every sale for the
     match (status, tickets, listed price, net) and a "Log sale" button.
   - The sales list (`/sales`) has no per-match filter. Its URL params are `year`, status tab,
     `edit`, `new`. A match filter would need a new param, server filtering in
     `sales/+page.server.ts` and a filter UI. That is a new feature, not part of this ticket.
   - `matchId` is already on `StripSegment`, so no data change is needed.
2. **Matches with no sales stay clickable.**
   - The match page handles zero sales ("No sales recorded for this match." plus "Log sale"),
     so the click is useful: it is the fastest route to log a sale for an upcoming match.
   - Making only some cards interactive would make the strip inconsistent for keyboard and
     screen-reader users, and "No sale" cards are exactly the ones the user wants to act on.

## Design

- Inside each `<li>`, wrap the card content in one `<a href="/matches/{segment.matchId}">`.
- Move the accessible label (`label`, today on the `<li>` as `aria-label` and `title`) onto the
  anchor, so a screen reader announces one link, not a labelled list item plus a link.
  The `<li>` keeps no `aria-label`.
- Styling: anchor is `block` and fills the `<li>`; hover lifts the colour bar slightly
  (`hover:opacity-90`) and underlines nothing; `focus-visible` ring using the project's
  existing focus-outline utility (same as the scroller). `motion-reduce` needs nothing since no
  transition is added.
- No change to `StripSegment`, venue filter, scroll centring or legend.
- Back navigation: browser back returns to `/accounting?venue=...` because the venue filter is
  in the URL, so the filter state survives the round trip. No extra work.

## Scope

- Web only. No backend, schema or API change.
- Non-goals: per-match sales filter on `/sales` (separate ticket if wanted), linking from the
  dashboard or season table, prefetch tuning.

## Testing

- e2e (`e2e/tests/accounting.e2e-spec.ts`, already in Playwright `testMatch`): the seeded
  match card is a link named with the opponent; clicking it lands on `/matches/<id>` and shows
  the opponent heading. Update the existing strip assertion from `listitem` to `link` role.
- No new unit test: there is no new pure logic (href is a template string).

## Size

About 40 lines changed (component about 15, e2e about 25). One PR, one layer, one actor.
No tech-debt entries in `docs/tech-debt.md` touch this area.
