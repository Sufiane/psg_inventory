---
target: homepage
total_score: 30
p0_count: 0
p1_count: 3
timestamp: 2026-06-20T10-13-21Z
slug: web-src-routes-page-svelte
---
# Critique — homepage under conversion brief

Brief shifted from product register (research tool restraint) to brand
register + conversion (showcase product, push to demo/signup). Detector
clean; brand-register slop tests fail.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Health probe, spinner, aria-busy. |
| 2 | Match System / Real World | 3 | No product visualization. |
| 3 | User Control & Freedom | 3 | Three CTAs, no dominant one. |
| 4 | Consistency & Standards | 4 | Button extracted. |
| 5 | Error Prevention | 3 | Outage probe in place. |
| 6 | Recognition vs Recall | 2 | Zero product imagery. |
| 7 | Flexibility & Efficiency | 2 | No dominant conversion path. |
| 8 | Aesthetic & Minimalist | 3 | Reads as timid under brand register. |
| 9 | Error Recovery | 3 | Outage surfaced inline. |
| 10 | Help / Documentation | 3 | Glossary lives on dashboard. |
| **Total** | | **30/40** | **Good (product), mid-pack (brand)** |

## Anti-Patterns Verdict

Three brand-register slop tells now apply:
1. Editorial-typographic lane (sans variant). Tight type + mono numerics +
   ruled dl + monochromatic restraint + zero imagery = the system-sans
   cousin of the Fraunces editorial trope.
2. Zero imagery on a product-imagery brief.
3. Restrained palette on a brand surface. --color-primary appears only
   inside buttons. ~2% of visible surface.

## Priority Issues

- **[P1] No product visualization** above the fold. Ship a real dashboard
  preview (static screenshot, SSR mini-dashboard, or live).
- **[P1] Two equal-weight demo CTAs** split the funnel. Promote one as the
  hero CTA; demote demo2 to a secondary link.
- **[P1] Brand color invisible.** Commit (hero accent column, drenched
  hero, or headline emphasis).
- **[P2] No what-you-get hierarchy.** Demo and signup look like siblings;
  they're not.
- **[P2] Tour dl is sentences, not vignettes.** Replace with cropped
  product surfaces.
- **[P3] No social proof or capability claim** beyond a footer disclaimer.

## Persona Red Flags

- Riley closes the tab without seeing a screen.
- Jordan can't pick between demo1 and demo2.
- Casey scrolls 600px before the first conversion signal.
