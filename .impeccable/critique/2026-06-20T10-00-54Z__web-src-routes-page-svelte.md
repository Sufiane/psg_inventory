---
target: homepage
total_score: 30
p0_count: 0
p1_count: 0
timestamp: 2026-06-20T10-00-54Z
slug: web-src-routes-page-svelte
---
# Re-Critique — homepage

After four commits (token fix, header/tap-target adapt, Button extraction, polish), score lifts from 25 -> 30. Detector clean.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | aria-busy + spinner + alert. |
| 2 | Match System / Real World | 3 | Domain language solid. |
| 3 | User Control & Freedom | 3 | No traps. |
| 4 | Consistency & Standards | 4 | Button extracted across surfaces. |
| 5 | Error Prevention | 2 | No backend-seed guard. |
| 6 | Recognition vs Recall | 3 | Demo creds visible. |
| 7 | Flexibility & Efficiency | 2 | No deep link / shortcut to demo. |
| 8 | Aesthetic & Minimalist | 4 | Scaffolding tells gone. |
| 9 | Error Recovery | 3 | Error message names cause. |
| 10 | Help / Documentation | 2 | Tour list orients, doesn't teach. |
| **Total** | | **30/40** | **Good** |

## Anti-Patterns Verdict

Pass on the ban list. Detector returns []. One leftover: <title> still contains an em dash.

## Priority Issues

- **[P2] Em dash in <title>** — replace with colon.
- **[P2] No backend-seed guard for demo** — server-side load could detect and warn.
- **[P2] Dashboard help/doc plateau** — first-run user lands without term explanations. Out of scope for homepage; handle in dashboard onboarding.
- **[P3] Brand text not a link** — should be `<a href="/">`.
- **[P3] "no signup required" decorative** — replace or drop.

## Persona Red Flags

- Jordan: operator language and slugs resolved.
- Riley: Button consolidation centralizes double-submit safety.
- Casey: header wraps, CTAs hit 44px.
