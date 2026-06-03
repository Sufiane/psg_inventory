---
target: web/src/routes/(app)/accounting/+page.svelte
total_score: 23
p0_count: 0
p1_count: 3
timestamp: 2026-06-03T08-33-10Z
slug: web-src-routes-app-accounting-page-svelte
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Picking a season de-highlights both top tabs; the chosen season lives only inside the dropdown |
| 2 | Match System / Real World | 3 | "Net realized profit", "Ticket invest", "Season investment" read accurately |
| 3 | User Control and Freedom | 2 | No reset / clear-season action; no way to drill into a sale from here |
| 4 | Consistency and Standards | 2 | Tabs vs dropdown for the same "which season" decision; mixed control vocabulary |
| 5 | Error Prevention | 3 | Read-only surface; nothing destructive to guard |
| 6 | Recognition Rather Than Recall | 3 | Seat metadata visible when set; breakdown is self-explanatory |
| 7 | Flexibility and Efficiency | 1 | No keyboard accelerators; season change is 2 clicks |
| 8 | Aesthetic and Minimalist Design | 2 | Uppercase tracked eyebrows on every section + three identical cards = AI-default cadence |
| 9 | Error Recovery | 3 | `{:catch}` shows plain-language failure |
| 10 | Help and Documentation | 2 | Net breakdown IS in-context help; no tooltips elsewhere |
| **Total** | | **23/40** | **Acceptable; significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment**: Reads AI-made. Two saturated tells: (1) uppercase tracked eyebrow on every section heading (`text-sm font-semibold text-slate-500 uppercase tracking-wide` repeated on 4 sections); (2) three-identical-card grid with stock Tailwind palette (slate-50/white/blue-600/emerald-600/red-600). Lands directly in the "generic SaaS dashboard" anti-reference PRODUCT.md rejects.

**Deterministic scan**: Detector returned 0 findings on the target and its components. The trope is cross-component pattern, which deterministic lint cannot see.

## Priority Issues

- **[P1] Uppercase tracked eyebrows on every section.** Anti-reference violation; also borderline contrast at slate-500 14px. Fix: drop uppercase + tracking-wide, use sentence-case with weight/scale hierarchy. Command: `/impeccable typeset`.
- **[P1] Profit/loss encoded by color alone.** Fails WCAG AA color-blindness commitment. Fix: pair color with explicit `+` / `−` sign on proceeds, net, per-card totals. Command: `/impeccable colorize`.
- **[P1] Flat hierarchy across Realized/Unrealized/Pending.** Three identical cards flatten the meaning. Realized should dominate; Unrealized + Pending should be compact supports. Command: `/impeccable layout`.
- **[P2] Three mismatched controls for one decision.** Two tab buttons + a dropdown answer the same "which period" question; picking a season de-highlights both tabs. Fix: merge into a segmented control or move dropdown into a distinct surface. Command: `/impeccable layout`.
- **[P2] Generic Tailwind-stock palette.** No committed color identity; reads "Tailwind tutorial". Fix: commit Restrained palette in OKLCH with a non-blue accent + ledger-grade semantic green/red. Command: `/impeccable colorize`.

## Persona Red Flags

**Alex (Power User)**: No keyboard shortcuts; season change is 3 interactions; expects cmd-k or `1`/`2`/`3` to jump views. All-time aggregates likely recomputed every nav with no client cache.

**Sam (Accessibility)**: Profit/loss color-only; `text-xs slate-500` borderline contrast; no `aria-current` on active tab; no `focus-visible` overrides so keyboard focus rings are inconsistent across anchors and form controls.

## Minor Observations

- `max-w-md` on the Net `<dl>` leaves the card half-empty at desktop widths.
- Best/Worst lines inside each AccountingCard could use labeled key/value pairs instead of running sentences.
- Right-aligned `font-mono` numerics — consider `font-feature-settings: "tnum"` to lock tabular figures.
- Verify Skeleton `animate-pulse` respects `prefers-reduced-motion`.

## Questions to Consider

- What if the Net breakdown were the whole page, with the three period cards as inline footnotes or one details disclosure?
- Does the All-time view need the same component vocabulary as a per-season view, or is it a different shape of question entirely?
- After a successful sale (the most common entry path), what's the one number the user wants in 200ms?
