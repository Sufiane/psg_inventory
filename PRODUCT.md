# Product

## Register

product

## Users

Season-ticket holders (initially PSG, scalable to any club) who use the app to track tickets they resell match-by-match. Primary context: at a desk, often immediately after a sale closes — they need fast entry. Secondary context: end-of-season accounting review — they need clear, defensible numbers.

The job on any given screen is one of:
- **Log a sale** quickly without ceremony.
- **See where I stand** (net profit after season pass + ticket invest, per-season and all-time).
- **Audit a number** (which match, which season, what got cancelled, was the cron run).

## Product Purpose

A precise personal-finance ledger for ticket resellers. It exists because spreadsheets are fast to start but quickly drift: dates get fuzzy, season costs aren't amortized, commission isn't reliably netted. This product enforces the model (sales tied to matches, matches grouped by season, season pass as a lump-sum cost) so the user's "am I actually making money?" question has a single, trustworthy answer.

Success looks like: the user opens the dashboard, sees one number (net realized profit), trusts it, and is done. No mental arithmetic, no exporting to Excel "just to check".

## Brand Personality

**Sharp · Quiet · Precise.**

Voice: matter-of-fact. State the number, name the source. No exclamation marks, no marketing energy, no "supercharge your season". UX copy reads like a well-edited financial summary: short sentences, exact nouns, present tense. When something is uncertain (pending sales, future season), the UI says so plainly rather than smoothing over.

The interface should feel closer to a research tool than a SaaS landing page. Whitespace is deliberate; color carries semantic weight (profit/loss, status) and nothing else. Numerics are first-class typography.

## Anti-references

- **Generic SaaS dashboards** (Stripe-clone marketing-y dashboards, gradient hero-metric cards, "Total revenue ↗ 24%" templates). This is a working ledger, not a pitch deck.
- **Sports-betting apps** (DraftKings, FanDuel). Loud neons, urgency cues, gamification — opposite of the calm posture we want, and an unfortunate semantic neighbor.
- **Fan-merch / club websites** (psg.fr and equivalents). Heavy hero photography, club-badge-everywhere, news-and-shop hybrid. We are deliberately not "a PSG site"; we are a tool that happens to know about PSG fixtures.
- **AI cream/beige editorial default** (warm near-white body bg, tracked uppercase eyebrows on every section, `--paper`/`--linen` tokens). The 2026 saturated AI tell.

## Design Principles

1. **Data is the product.** UI chrome stays out of the way; the numbers and entries are foreground. Cards exist only when they're the best affordance.
2. **Precision earns trust.** Every figure is sourced and reproducible. Show the math when it matters (net = proceeds − ticket invest − season pass, line-by-line). Never display a number whose origin can't be explained.
3. **One altitude per signal.** Net profit, period totals, per-sale rows, and metadata each have a fixed visual altitude. Don't flatten the hierarchy by using the same type scale for "Net" and "ticket count".
4. **Keyboard-fluent, mouse-tolerable.** The primary loop (log sale, mark sold, jump between seasons) should feel fast on keyboard. Mouse-only paths exist but are never the recommended way.
5. **Honest about state.** Pending, unrealized, future seasons, missing data — name them. Don't paper over an unset season pass with a zero; tell the user it's unset and link them to where they'd fix it.

## Accessibility & Inclusion

- Target **WCAG 2.2 AA**: body text ≥4.5:1 contrast, large text ≥3:1, focus rings on all interactive elements, keyboard reachable.
- `prefers-reduced-motion` respected on every animation (the existing Skeleton uses `animate-pulse` — provide a static fallback).
- Currency and numerics use locale-aware formatting (`Intl.NumberFormat`, already in place via `format.ts`).
- Profit/loss and sale-status signals must not rely on color alone — pair color with a label or shape (e.g. status pill text, ± sign, icon).
- Form errors announced inline beside the offending field, not only in a toast.
