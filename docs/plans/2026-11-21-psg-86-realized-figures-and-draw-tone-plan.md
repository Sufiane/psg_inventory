# PSG-86 realized figures and draw tone: implementation plan

Spec: `docs/specs/2026-11-21-psg-86-realized-figures-and-draw-tone-design.md`.
Size: ~160 lines total, fits one PR (cap 800). Frontend-only, no split needed.
Style reminders for the builder: explicit return types, no single-letter names, braces on
every `if`, blank line before `if/return`, no barrel files, no comments unless a non-obvious why.
Conventional commit, e.g. `refactor(web): share realized figures across dashboard, accounting and showcase (PSG-86)`.

## Part A (unconditional)

### Task A1: helper (TDD)
Files: `web/src/lib/sale-math.ts`, `web/src/lib/sale-math.spec.ts`.
1. In the spec add `describe('realizedFigures')` with nested `when realized sales exist`
   (expect proceeds 500, invest 150, seasonInvest 100, net 250) and `when realized is null`
   (0, 0, 100, -100). Run `npm test -w web` (or repo equivalent): fails.
2. Add exported type `RealizedFigures` and `realizedFigures(accounting: Pick<TimePeriodAccounting,
   'realized' | 'totalSeasonInvestment'>): RealizedFigures`. Rewrite `realizedNet` as
   `return realizedFigures(accounting).net;`. Existing `realizedNet` tests must stay green.

### Task A2: migrate call sites
1. `web/src/routes/(app)/dashboard/+page.svelte`: replace the four `{@const}` lines
   (realizedProceeds, realizedInvest, seasonInvest, netProfit) with one
   `{@const figures = realizedFigures(accounting)}` and use `figures.*` (or alias consts
   from it). `hasPass` and the cancelled/gifted/pending consts stay.
2. `web/src/routes/(app)/accounting/+page.svelte`: `figuresOf` returns
   `realizedFigures(accounting)` mapped to its current shape, or callers switch to the new
   shape; prefer the latter if the usages are few, and delete `figuresOf` if empty.
3. `web/src/routes/+page.server.ts` showcase: build `netProfit`, `realizedProceeds`,
   `realizedInvest`, `seasonInvest` from `realizedFigures(accounting)`; keep the Showcase
   object shape. Keep the `soldCount` comment (real why).
4. Confirm `grep -rn "totalSeasonInvestment" web/src` shows only `sale-math.ts` and types.

## Part B (only if the open question is resolved as option B)

### Task B1: outcome helper (TDD)
Files: `web/src/lib/matches-view.ts`, `web/src/lib/matches-view.spec.ts`.
Tests first, one `describe` per condition: win, loss, draw (home), draw (away), score
unparseable (falls back to `isWin`), no usable score (null; reuse `displayScore`).
Implement `matchOutcome` parsing `/^(\d+)\s*-\s*(\d+)$/`; equal goals is draw.

### Task B2: components
Files: `web/src/lib/ui/MatchRow.svelte`, `web/src/lib/ui/MatchInspector.svelte`.
Define one shared tone/label map next to `matchOutcome` (win `text-positive-strong`/"win",
draw `text-ink-muted`/"draw", loss `text-negative`/"loss"). Replace both `isWin` ternaries.
Row keeps the label sr-only; inspector shows it in parentheses.
If the decision is option A or C: skip B1, B2 (C only swaps the draw class to `text-warning-strong`).

## Verification (hand to qa-verifier)
`npm run check`, lint and unit tests in `web/`; visually confirm dashboard, accounting
and landing showcase figures are unchanged against the seeded demo data.
