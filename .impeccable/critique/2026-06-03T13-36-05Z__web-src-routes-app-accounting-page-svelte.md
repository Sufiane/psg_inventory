---
target: web/src/routes/(app)/accounting/+page.svelte
total_score: 31
p0_count: 0
p1_count: 1
timestamp: 2026-06-03T13-36-05Z
slug: web-src-routes-app-accounting-page-svelte
---
## Design Health Score

| # | Heuristic | Score | Δ | Key Issue |
|---|-----------|-------|----|-----------|
| 1 | Visibility of System Status | 4 | — | aria-current on all segments |
| 2 | Match System / Real World | 3 | — | Ledger vocabulary; sign + color redundant |
| 3 | User Control and Freedom | 2 | — | No reset / no drill |
| 4 | Consistency and Standards | 4 | +1 | Single segmented control replaces 3 mismatched controls |
| 5 | Error Prevention | 3 | — | Read-only; placeholder now `disabled hidden` |
| 6 | Recognition Rather Than Recall | 4 | — | Active state visible everywhere |
| 7 | Flexibility and Efficiency | 1 | — | No keyboard accelerators |
| 8 | Aesthetic and Minimalist Design | 4 | +1 | Asymmetric hierarchy replaces identical card grid |
| 9 | Error Recovery | 4 | — | role="alert" + tinted bg + plain language |
| 10 | Help and Documentation | 2 | — | Net breakdown is the help |
| **Total** | | **31/40** | **+2** | **Good, edging toward Excellent** |

## Anti-Patterns Verdict

**LLM assessment**: Reads as a designed financial tool, not a Tailwind starter. Three altitudes (Net at top, Realized as detail, Unrealized + Pending as compact strips) replace the flat-cards trope. Segmented control unifies the period decision. **Layout pass introduced a hierarchy inversion**: compact strips show `totalProfit` at `text-2xl` while the Net card's "Net" row stays at `text-sm` (inherited from the dl). Supporting context is louder than the primary signal.

**Deterministic scan**: Clean.

## Priority Issues

- **[P1] Hierarchy inversion: Net total is the smallest large number on the page.** The Net row inherits `text-sm` from the dl; compact strips display `totalProfit` at `text-2xl font-semibold`. Bump the Net total out of the dl or scale it to `text-xl` minimum. The page's bottom-line answer should be the loudest. Command: `/impeccable layout` (small edit).
- **[P2] Touch targets regressed inside the segmented bar.** Segments are `py-1.5 px-3` (~30px); previous polish had them at ~40px. Mobile users have a harder time tapping. Bump back to `py-2 px-3` inside the bar. Command: `/impeccable layout`.
- **[P3] Information duplication between Net card and Realized card.** Net shows "Realized proceeds" + "Ticket invest"; Realized card shows "Total profit" + "Total invest". Same numbers, two altitudes. Realized card could drop the duplicated rows and keep only what Net doesn't show. Command: `/impeccable distill`.

## Persona Red Flags

**Alex**: Still no keyboard accelerators.

**Sam**: Touch-target regression also affects low-vision pointer users. Verify the global `:focus-visible` outline renders cleanly on the bare `<select>` (Safari historically inconsistent on native select focus indicators).

**Casey (Mobile)**: Bar wraps below sm via `flex-wrap`; compact strips stack via `sm:grid-cols-2`. Touch target regression is the only remaining mobile-specific issue.

## Minor Observations

- "€X listed value" on Unrealized strip reads as if still listed; Unrealized = cancelled. Reword to "previously listed" or just "value €X".
- Native `<select>` chevron may render dark-on-dark when `bg-primary` is active in some browsers. Verify; inline-SVG chevron is the deterministic fix.
- Reduced-motion CSS now zeros all transitions globally; segment state changes snap for opted-out users. By design.

## Questions to Consider

- Should the Net total live *outside* the breakdown card, as a page-level headline number?
- Realized shows Best/Worst per period; should "this season's best" appear next to "all-time best" in the all-time view?
- Is the Realized card carrying its weight, given the Net card already shows realized proceeds + invest?
