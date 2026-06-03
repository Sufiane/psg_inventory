---
target: web/src/routes/(app)/accounting/+page.svelte
total_score: 29
p0_count: 0
p1_count: 1
timestamp: 2026-06-03T09-06-43Z
slug: web-src-routes-app-accounting-page-svelte
---
## Design Health Score

| # | Heuristic | Score | Δ | Key Issue |
|---|-----------|-------|----|-----------|
| 1 | Visibility of System Status | 4 | +2 | `aria-current` on all 3 controls; selected season visibly active; streamed skeletons |
| 2 | Match System / Real World | 3 | — | Vocabulary accurate; `+` / `−` signs on signed values match ledger expectation |
| 3 | User Control and Freedom | 2 | — | No reset / clear-season action; no drill into a sale from here |
| 4 | Consistency and Standards | 3 | +1 | Committed OKLCH tokens applied; controls still mixed but visually unified |
| 5 | Error Prevention | 3 | — | Read-only surface |
| 6 | Recognition Rather Than Recall | 4 | +1 | Active state always visible; seat metadata + breakdown explicit |
| 7 | Flexibility and Efficiency | 1 | — | No keyboard accelerators |
| 8 | Aesthetic and Minimalist Design | 3 | +1 | Eyebrows killed, palette committed, hierarchy via scale + weight; 3 identical cards still flatten meaning |
| 9 | Error Recovery | 4 | +1 | `role="alert"` + tinted bg + plain language |
| 10 | Help and Documentation | 2 | — | In-context Net breakdown is the help; nothing else |
| **Total** | | **29/40** | **+6** | **Good band; one P1 left** |

## Anti-Patterns Verdict

**LLM assessment**: No longer reads AI-made. Committed ink-violet primary, ledger-toned green/red, tinted surface, sentence-case headings, signed-money treatment add up to a deliberate visual identity. Category-reflex check passes first-order (palette doesn't betray category) and largely second-order (not Tailwind blue, not navy-fintech, not cream-paper, not dark-terminal). Lingering tell: three-identical-card grid still reads as "I had three things and put them in a row".

**Deterministic scan**: Clean across target + components + tokens.

## Priority Issues

- **[P1] Three period cards render at identical weight.** Realized is the truth; Unrealized + Pending are supporting context. Equal-weight `grid md:grid-cols-3 gap-4` of identical AccountingCards flattens meaning. Fix options: promote Realized to col-span-2, inline Realized into Net section, or compact Unrealized + Pending to stat-strips. Command: `/impeccable layout`.
- **[P2] Three controls for one decision.** Active state now visible, but conceptually still two tabs + one select competing for "which period". Segmented control (Current · All time · 2024 ▾) would collapse the three to one. Command: `/impeccable layout`.
- **[P3] No keyboard accelerators.** Alex still mouses to switch periods. Number-key tab switch or Cmd+K season jump. Optional power-user lever.

## Persona Red Flags

**Alex (Power User)**: Same gap; no shortcuts. Everything else Alex needed is in place.

**Sam (Accessibility-Dependent)**: Substantially resolved.
- Sign + color redundant encoding ✓
- `aria-current="page"` on all 3 controls ✓
- Global `:focus-visible` ring via `:where()` ✓
- `aria-labelledby` on Net section ✓
- `role="alert"` on errors ✓
- `aria-label` on landmarks ✓
- Remaining: "Pick season…" placeholder, when selected from a non-current state, silently lands in current-season. Mark `disabled hidden` or rename "Reset to current".

## Minor Observations

- Placeholder option ambiguity (see Sam).
- "Ticket invest (all time)" vs "Season investment (all seasons)" parenthetical wording is inconsistent; both get scope hints always, or neither.
- Best/Worst line wraps mid-clause at narrow widths; `flex flex-wrap items-baseline gap-x-2` would let the wrap fall between value and prose.
- Three "·" separators on Best/Worst lines arguably one bullet too many.
- Reduced-motion CSS now zeros every animation/transition. Correct, but disables active-tab `transition-colors` for those users by design.

## Questions to Consider

- The Realized period card and the Net section both describe the same realized data at different altitudes. Inline Realized into the Net section?
- "Pick season…" first-option behavior is functionally a no-op when chosen first. Remove the placeholder entirely; default to current season.
- Is "All time" a useful default landing, or is "Current season" the answer to "how am I doing right now" 90% of the time?
