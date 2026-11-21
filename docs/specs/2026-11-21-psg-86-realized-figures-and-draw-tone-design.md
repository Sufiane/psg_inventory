# PSG-86 realized-net dedupe and draw tone: design

Status: draft for review. Plan: `docs/plans/2026-11-21-psg-86-realized-figures-and-draw-tone-plan.md`.
Scope: `web/` only, no backend change. Tech-debt ticket, XS. `docs/tech-debt.md` has no
entry for this (only PSG-49, PSG-87; PSG-87 is unrelated, touches the Sales drawer).

## 1. Part A: one source for realized figures

`realizedNet(accounting)` in `web/src/lib/sale-math.ts` (PSG-81) returns only the net. Three
other places recompute `realized.totalProfit - realized.totalInvest - totalSeasonInvestment`
because they also need the parts:

| Site | What it needs |
|---|---|
| `web/src/routes/(app)/dashboard/+page.svelte` (`{@const}` block, ~L56-62) | proceeds, invest, seasonInvest, net |
| `web/src/routes/(app)/accounting/+page.svelte` (`figuresOf`) | same four |
| `web/src/routes/+page.server.ts` (showcase loader) | same four |

Correction to the ticket: the dashboard formula lives in the page component, not its loader
(`dashboard/+page.server.ts` has none). The accounting page and the landing-page showcase
carry the same copy, so fixing only the dashboard would leave two duplicates.

### Decision: extend the helper to return the parts

Option 1, dashboard keeps its own maths and calls `realizedNet` for the net only: still
re-derives proceeds and invest, so the formula stays in two places. Rejected.

Option 2 (chosen): add `realizedFigures(accounting)` returning
`{ proceeds, invest, seasonInvest, net }`, and make `realizedNet` return
`realizedFigures(accounting).net`. All four sites use it. Matches loader is unchanged.
Field names: `proceeds`/`invest`/`seasonInvest`/`net`; call sites map to their existing local
names where the template already uses them, to keep diffs small.

Behaviour is identical (null `realized` gives zeros, net is `-seasonInvest`). No visible change.

## 2. Part B: do draws need their own tone? (OPEN, decision needed)

Today `MatchRow.svelte` and `MatchInspector.svelte` colour the score by `result.isWin` only:
win is `text-positive-strong`, everything else `text-negative`, with the label
"loss or draw" (sr-only in the row, visible in the inspector). A draw reads as a loss.

Facts that bound the options:
- Backend `isWin` is a boolean; football-data sets it from `score.winner`, so a draw is
  `isWin: false`. No tri-state is stored, and the admin form has a single "isWin" checkbox.
- A draw is detectable client-side: `score` is `"home - away"`; equal goals means draw. No
  backend or schema change is needed. Fallback when the score does not parse: use `isWin`.
- Palette already has `positive`, `negative`, `warning`, plus neutral `ink-muted`.

Options:
- A. Leave as is. Zero cost; draws stay mislabelled, "loss or draw" stays vague.
- B. Draw gets a neutral tone (`text-ink-muted`) and label "draw". Win and loss unchanged.
- C. Draw gets `warning` amber. Amber elsewhere signals attention/risk, which a draw is not.

Recommendation: B. Cost is small (~one helper, two components). Neutral keeps red for
losses only and removes the vague label, without borrowing a status colour. Not
resolved here; the coordinator/user decides. Part A is independent and proceeds either way.

If B is approved: add `matchOutcome(match): 'win' | 'draw' | 'loss' | null` to
`web/src/lib/matches-view.ts` (null when no usable score). Components switch on it instead of
`isWin`, via a shared tone/label map (no duplication across the two components).

## 3. Testing

Vitest unit tests only (no component harness in this repo, F2 from the stitch spec).
- `realizedFigures`: realized present, realized null; `realizedNet` existing tests keep passing.
- `matchOutcome` (if B): win, loss, draw home, draw away, unparseable score falls back to
  `isWin`, no score returns null.
Gates: `web` check, lint, test.

## 4. Size

Part A about 60 lines (helper 12, tests 25, call-site changes net near 0 or negative).
Part B about 90 lines (helper 20, tests 40, two components 30). Total under 160, one PR.
