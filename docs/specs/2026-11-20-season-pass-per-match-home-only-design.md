# Season pass per match counts home games only: design

Date: 2026-11-20. Branch: `naypyidaw/away-games-season-pass-exclude`. Layer: web only.

## Problem

The accounting page shows "Season pass per match" as `passPrice ÷ N fixtures = cost`. `N` currently includes away games. Away games are not covered by the season pass, so they must not be in the denominator.

## Findings (audit)

Exactly one place divides the pass price by a match count.

| Site | What it does | Includes away? | Action |
|---|---|---|---|
| `web/src/routes/(app)/accounting/+page.svelte:157` | passes `matchCount={view.matches.length}` to `AmortisationBlock` | yes, `view.matches` is every match of the season (`/matches/season/:y`, `/matches/current-season`) | change to home-only count |
| `web/src/lib/ui/AmortisationBlock.svelte:39-51` | renders `passPrice ÷ matchCount`, empty state "No fixtures in this season.", label "fixtures" | consumes the count above | rename prop, change copy to "home fixtures" |
| `web/src/lib/accounting-view.ts` `passCostPerMatch` | pure `price / count`, 0 when count is 0 | no, count-agnostic | unchanged |

Checked and not affected:

- Backend: `GetAmortizationUsecase` (`src/api/accounting/usecases/get-amortization/get-amortization.usecase.ts`) never divides by a match count. `passPrice` is the sum of the season's passes; `progress`, `remaining`, `surplus`, `breakEven` compare cumulative realized profit with the whole pass price. No per-match pass cost exists server-side. `atHome` is already on `FormattedMatch` and `AmortizationMatchRow`.
- Break-even / ROI (`progress`, `remaining`, `surplus`, `breakEven`): total pass price vs cumulative realized profit across all sold matches. Independent of match count. Unchanged.
- Net profit waterfall and "Season pass cost" tile: subtract the lump-sum pass price once. Unchanged.
- Ask feature context (`src/api/ask/context/build-context.ts`): passes `passPrice`, `progress`, `remaining`; no per-match pass cost. Unchanged.
- Dashboard, season page, matches page, sales pages: `matches.length` uses there are emptiness checks, not pass maths. Unchanged.
- `MatchdayStrip` and `SeasonMatchTable`: list every match with sales. They show no pass cost. Unchanged.

## Approaches

A. Frontend only. Add pure helper `homeMatchCount(matches)` to `accounting-view.ts`; the page passes it to `AmortisationBlock`. Data is already on the client. No API, cache or contract change. Recommended.

B. Backend adds `homeMatchCount` (and possibly `passCostPerMatch`) to `Amortization`. Moves arithmetic server-side but changes a Redis-cached payload (`accounting:user:id:*:amortization:*`, 1 day TTL), so deploy leaves stale entries missing the field until expiry or a flush; needs a shared type change and web type change for no new capability. Rejected: more surface, more risk, same result.

C. Filter `view.matches` to home-only in `+page.server.ts` so every consumer gets home matches. Rejected: the strip and table must keep away matches (sales on away matches exist and must stay visible).

## Design (approach A)

1. `accounting-view.ts`: add `homeMatchCount(matches: FormattedMatch[]): number` returning the count of `match.atHome === true`.
2. `accounting/+page.svelte`: `<AmortisationBlock data={view.amortization} homeMatchCount={homeMatchCount(view.matches)} />`.
3. `AmortisationBlock.svelte`: prop renamed `matchCount` to `homeMatchCount`; copy "fixtures" becomes "home fixtures"; empty state "No home fixtures in this season." when the count is 0. The divide-by-zero guard in `passCostPerMatch` already covers 0.
4. No backend, schema, cache or shared-type change.

## Tests

- `accounting-view.spec.ts`: `describe('homeMatchCount')` with conditions: mixed home/away list counts only home; all-away list returns 0; empty list returns 0. Existing `passCostPerMatch` specs unchanged.
- Existing e2e `e2e/tests/accounting.e2e-spec.ts` does not assert the per-match line; no e2e change required. Builder confirms with a grep before finishing.

## Decisions taken on judgment

- D1. Away matches get no season-pass cost. The pass is a lump sum amortised over home fixtures only; away rows show no pass cost today and none is added.
- D2. Break-even, net profit and the "Season pass cost" tile keep using the full pass price. Only the per-match division changes.
- D3. Profit from sales on away matches still counts in `totalRealized` and break-even (the user can resell away tickets; excluding it would change money totals, which the request does not ask for).
- D4. Home count is computed over all home matches of the season, played and upcoming, matching the old behaviour (all fixtures).

## Open questions (for the owner)

- Q1. Should break-even cumulative profit exclude away-match sales? Current behaviour counts them (D3). Say so if the pass should be recouped from home sales only.
- Q2. Should the matchday strip visually mark away matches as outside the pass? Not done here.
- Q3. Cup or non-league home games: the pass may not cover every competition. All `atHome` matches are counted. Competition filtering would be a separate ticket.
