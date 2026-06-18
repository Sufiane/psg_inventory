---
target: homepage
total_score: 25
p0_count: 0
p1_count: 3
timestamp: 2026-06-18T19-23-01Z
slug: web-src-routes-page-svelte
---
# Critique — homepage

Detector clean (0 findings); brief-fit is the problem. The page reaches for the SaaS-landing scaffold PRODUCT.md explicitly bans.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Per-row spinner; inline alert. |
| 2 | Match System / Real World | 3 | Domain language is right. |
| 3 | User Control & Freedom | 3 | Sign in / Create / Demo all reachable. |
| 4 | Consistency & Standards | 3 | Reuses tokens and login styles. |
| 5 | Error Prevention | 2 | No guard if backend unseeded. |
| 6 | Recognition vs Recall | 3 | Demo creds visible. |
| 7 | Flexibility & Efficiency | 2 | No deep link / shortcut to demo. |
| 8 | Aesthetic & Minimalist | 1 | Eyebrow + 01/02/03 numbered cards + identical grid. |
| 9 | Error Recovery | 3 | Demo error names cause and likely fix. |
| 10 | Help / Documentation | 2 | Only the tour list orients new users. |
| **Total** | | **25/40** | **Acceptable** |

## Anti-Patterns Verdict

Three direct hits on bans:
1. Tracked-uppercase eyebrow `Ledger · v1` — PRODUCT.md anti-reference verbatim.
2. `01 / 02 / 03` numbered cards on a non-sequence — impeccable ban.
3. Three identical cards in Design Principles — impeccable ban.

Copy tells: em dashes in three places (banned globally), and aphoristic-cadence "statement, then short rebuttal" appears in all three principle cards.

Deterministic scan: 0 findings; detector is syntactic only and cannot see the brief.

## Priority Issues

- **[P1] Tracked-uppercase eyebrow `Ledger · v1`** — delete it.
- **[P1] Numbered identical cards in Design Principles** — drop section or rewrite as flat prose.
- **[P1] Em dashes in body copy** — replace with commas/colons/periods.
- **[P2] Aphoristic-cadence repetition** — rewrite or remove with the cards.
- **[P2] Button label `Sign in as demo1`** — slug, not verb-object. Label by what the user gets.

## Persona Red Flags

- Jordan: "Re-seeding wipes and rebuilds these two users only" is operator language. Slug labels confuse.
- Riley: Demo buttons disabled-while-one-submits is correct; verify cookie+refresh paths.
- Casey: Sign in / Create account in top corner are thumb-far; demo block below fold on small viewports.

## Minor Observations

- `<em class="not-italic">` for color-only emphasis announces "emphasis" in screen readers.
- "read-write · ephemeral" label has no referent.
- Tour list label widths fixed at 8rem will break with longer labels.
- Hero lead paragraph could go up to `text-lg`.
- Add og:title/og:description.

## Questions

- What does `/` look like for a returning user?
- Could the demo card be the hero?
- Is Design Principles for visitors or for you?
