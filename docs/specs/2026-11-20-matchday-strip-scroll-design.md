# Matchday strip: horizontal scroll with legible fixtures

Follow-up to PSG-83 (`docs/specs/2026-11-20-psg-83-accounting-page-design.md`, `MatchdayStrip`). Web only.

## Problem

`web/src/lib/ui/MatchdayStrip.svelte` renders one `flex-1 min-w-0` `<li>` per fixture, so 19+ fixtures share one row width. Each segment is a few pixels wide. The date is `hidden` below `sm` and `truncate`d above it. The opponent is never visible (only in `aria-label` and `title`). The user cannot read either.

## Decision

Fixed-width fixture cards in a horizontally scrolling container. Each card shows colour bar (with break-even star), date, opponent. Legend stays outside the scroller.

### Layout

- Scroller `<div>` wraps the `<ol>`: `overflow-x-auto`, `snap-x snap-proximity`, `pb-2`. `<ol>` becomes `flex w-max gap-2`.
- Card `<li>`: `w-24 shrink-0 snap-start` (96px, about 6rem). Opponent at `text-xs`, two lines max (`line-clamp-2`, `break-words`), so "Paris FC", "Saint-Etienne", "Olympique de Marseille" stay readable. Date `text-xs text-ink-faint` above the opponent, always visible at every breakpoint.
- Colour bar keeps `h-7`, same fills, same star. Full card width instead of a sliver.
- Native scrollbar stays visible (no `no-scrollbar`): it is the scroll affordance on desktop. Touch gets momentum scroll for free.
- Legend: unchanged, below the scroller, not inside it, never scrolls.

### Initial position

On mount (and when `segments` change), scroll the container so the next upcoming fixture is centred: first segment with `date >=` start of today, else the last segment (season over), else nothing. Set `scrollLeft` on the container directly; never `scrollIntoView`, which would also scroll the page. Instant, not smooth (no motion to suppress, so reduced-motion is satisfied by construction).

The index logic is a pure helper `upcomingIndex(segments, today)` in `accounting-view.ts` (vitest).

### Edge fades

Two `pointer-events-none`, `aria-hidden` gradient overlays (`w-10`, `from-surface-subtle` to transparent, the page background token) on the left and right edges of the scroller, stopping above the scrollbar. Each is visible only when more content lies in that direction: left when `scrollLeft > 1`, right when `scrollLeft + clientWidth < scrollWidth - 1`. State is recomputed on scroll, window resize, and after the initial centring. Opacity toggles (no motion under reduced-motion). The legend is outside and unaffected. The upcoming fixture is centred only, with no highlight or tag.

### Keyboard and a11y

- Scroller: `role="region"`, `aria-label="Matchday strip scroller"`, `tabindex="0"`, visible focus ring. Arrow keys then scroll natively. Needed because the cards are not focusable and an `overflow` container without focusable content is unreachable by keyboard in some browsers.
- The `<ol aria-label="Matchday strip">` and per-`<li>` `aria-label` (opponent, date, status, break-even) stay as is; e2e locates by them. Visible text is now duplicated by the label, so the inner visible spans stay in the accessible name only via the `<li>` label (existing behaviour). No change to the contract.
- Colour is still never alone: star for break-even, text in the label, legend text.

### Mobile

Same component, same 96px cards. About 3.5 cards visible at 360px, which hints that it scrolls. `snap-proximity` rather than `mandatory` so a fast flick is not fought.

## Out of scope

- Tapping a card to open the match (strip is read-only today; separate feature).
- Home/away marker or competition on cards (needs `StripSegment` change).
- Scroll arrows/buttons. Add only if the scrollbar and edge fades prove too subtle.

## Alternatives rejected

- Wrapping to multiple rows: loses the chronological one-line read the stitch design wants, grows the page.
- Smaller font/abbreviated opponent: still unreadable at 19 fixtures in one row.

## Testing

- Vitest: `upcomingIndex` (future fixtures present, today's fixture counts as upcoming, all past, empty).
- e2e: extend `e2e/tests/accounting.e2e-spec.ts` — strip scroller region exists and the seeded opponent text is visible inside it.
- Manual: 360px and 1280px, season with 19 fixtures, keyboard focus + arrows.

## Backend

None. Data already carries `opponent` and `date` on `StripSegment`.
