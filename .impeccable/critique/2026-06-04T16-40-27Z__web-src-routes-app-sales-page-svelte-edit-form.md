---
target: sales edit form (inline panel on /sales)
total_score: 29
p0_count: 0
p1_count: 1
timestamp: 2026-06-04T16-40-27Z
slug: web-src-routes-app-sales-page-svelte-edit-form
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No expand animation, no focus jump |
| 2 | Match System / Real World | 4 | |
| 3 | User Control and Freedom | 3 | No ESC handler |
| 4 | Consistency and Standards | 3 | Input py-1.5 vs py-2 elsewhere |
| 5 | Error Prevention | 3 | Past-match + delete confirms in place |
| 6 | Recognition Rather Than Recall | 3 | Current status not echoed inside panel |
| 7 | Flexibility and Efficiency | 2 | No ESC, no autofocus, no row kbd nav |
| 8 | Aesthetic and Minimalist Design | 3 | Sold checkbox alignment awkward |
| 9 | Error Recovery | 3 | role=alert; not per-field |
| 10 | Help and Documentation | 2 | sold/pending/cancelled state machine implicit |
| **Total** | | **29/40** | **Good** |

## Anti-Patterns Verdict

LLM: not modal-shaped; clean inline. Cancel-link ml-auto reads slightly like default modal grammar.
Detector: 0 findings.

## Priority Issues

- **[P1] No focus management on expand.** When ?edit={id} opens panel, focus stays on the trigger link. Move focus to first input; restore on close. Command: `/impeccable audit`.
- **[P2] No ESC to close.** Inherits dialog expectation, lacks keyboard exit. Bind ESC → goto urlWithEdit(null). Command: `/impeccable polish`.
- **[P2] Sold checkbox alignment is awkward.** Promote to sm:col-span-2 row above buttons. Command: `/impeccable layout`.
- **[P2] Current status not echoed inside panel.** Add "Currently: <pill>" inside form OR replace boolean checkbox with status segmented control. Command: `/impeccable clarify` or `/impeccable shape`.
- **[P3] No expand/collapse motion.** Add transition:slide; reduced-motion already zeros. Command: `/impeccable animate`.

## Persona Red Flags

Alex: no kbd shortcuts on inline panel, no cmd+s.
Sam: panel opens without focus shift or aria-live announcement.
Jordan: Mark-as-sold checkbox doesn't communicate state machine.

## Minor Observations

- Cancel as <a> reads weakly compared to buttons.
- Input height: three values across app (py-1.5 / py-2). Pick one rule.
- form?.message not per-field.
