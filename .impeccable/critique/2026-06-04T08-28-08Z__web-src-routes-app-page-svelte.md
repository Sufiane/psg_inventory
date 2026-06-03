---
target: dashboard (web/src/routes/(app)/+page.svelte)
total_score: 29
p0_count: 0
p1_count: 2
timestamp: 2026-06-04T08-28-08Z
slug: web-src-routes-app-page-svelte
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | aria-live used on a non-updating value |
| 2 | Match System / Real World | 4 | Domain terms accurate |
| 3 | User Control and Freedom | 3 | No quick exits to primary action |
| 4 | Consistency and Standards | 3 | Net card is bespoke, not an AccountingCard variant |
| 5 | Error Prevention | 3 | Read-only surface |
| 6 | Recognition Rather Than Recall | 3 | Best/Worst rows lack match date |
| 7 | Flexibility and Efficiency | 2 | No entry to "log a sale" from dashboard |
| 8 | Aesthetic and Minimalist Design | 3 | Three full cards repeat at-a-glance scaffolding |
| 9 | Error Recovery | 3 | Inline alerts |
| 10 | Help and Documentation | 2 | Unrealized / Pending undefined |
| **Total** | | **29/40** | **Good** |

## Anti-Patterns Verdict

LLM: not AI-generated to a fluent product user. Three full equally-sized cards with identical header+dl+Best/Worst pattern brushes against "identical card grids."

Detector: 0 findings.

## Priority Issues

- **[P1] No entry to the primary action.** Dashboard has no New Sale link; PRODUCT.md names this as the top job. Fix: primary button beside H1 to `/sales/new`. Command: `/impeccable shape` then `/impeccable craft`.
- **[P1] Net vs Realized ambiguity.** Hero "Net realized profit" sits above Realized card whose totalProfit is proceeds-minus-invest (before season pass). Fix: inline-label Realized's profit row or drop it on dashboard. Command: `/impeccable clarify` or `/impeccable distill`.
- **[P2] Three full cards repeat scaffolding.** Pass variant="compact" to match accounting page. Command: `/impeccable distill`.
- **[P2] aria-live="polite" on static value.** Remove. Command: `/impeccable audit`.
- **[P2] Zero-net paints green.** Ternary should treat 0 as ink. Command: `/impeccable polish`.

## Persona Red Flags

Alex: no keyboard accelerator, must mouse to nav for new sale.
Sam: Best/Worst rows lack match date; SR user gets opponent+competition but no when.

## Minor Observations

- Upcoming match row: "View" link only affordance; make whole row a link.
- `w-32` date column may clip French long dates.
- 30/60ms stagger doesn't earn its keep; drop, keep single fade.
- Empty `{:catch}` in Net section: render `—` or remove.
