# PSG-92 Sales edit drawer profit block: implementation plan

Spec: `docs/specs/2026-11-21-psg-92-sales-edit-drawer-profit-block-design.md`.
Branch `psg-92`. Conventional commits, brief builders on that. Stage, do not commit, until the
user has run `/crit`.

## Proposed ticket split

| Slice | Layer / actor | Depends on | Est. lines (tests+docs incl.) |
|---|---|---|---|
| PSG-92a Commission endpoint | backend, athlete (authed user) | none | ~90 |
| PSG-92b Shared breakdown util + SaleProfitBlock + drawer wiring | web, athlete | 92a (or fallback A) | ~330 |
| PSG-90 Log sale preview (separate ticket) | web, athlete | 92b (consumes util, component and `commissionPercent` load data) | not estimated here |

Total for this ticket about 420 lines, under the ~800 cap. It is split only because it crosses
two layers (rule: one layer per slice). 92b must merge before PSG-90 uses the shared pieces;
if PSG-90 is built first it must not add its own math (rebase on 92b).
Fallback if the coordinator rejects Q1 option B: drop 92a, use `web/src/lib/commission.ts`
(`export const COMMISSION_PERCENT = 12`, ~5 lines), file a follow-up to replace it; 92b shrinks
by the load fetch change only.
Drawer extraction from `+page.svelte` is not in this plan (known follow-up F5).

## Slice 92a: backend commission endpoint (backend-builder)

Files: `src/api/sales/sales.controller.ts`, `src/api/sales/sales.service.ts` (+ interface in
`interfaces/sales.service.interface.ts`), `src/api/sales/sales.service.spec.ts`, e2e spec.
No db file: no data access, so no `*.db.ts` (per hexagonal rule).

- [ ] Test first: service spec, `getCommission()` returns `{ commissionPercent: PSG_COMMISSION }`.
- [ ] Add `@Get('/commission')` in `SalesController` declared BEFORE `@Get('/:saleId')`
      (otherwise `commission` is parsed as a sale id). Explicit return types.
- [ ] Add `CommissionResponse` type with `Percentage` brand from `@psg/shared/percentage`.
- [ ] e2e: authenticated `GET /sales/commission` returns 200 with 12; unauthenticated 401.
      Confirm the spec file is in the e2e testMatch.
- [ ] Verify: backend unit tests, lint, and `test -f dist/main.js` after build.

## Slice 92b: web (frontend-builder)

Files: `web/src/lib/sale-math.ts` + `sale-math.spec.ts`, `web/src/lib/ui/SaleProfitBlock.svelte`,
`web/src/lib/types.ts` (commission type), `web/src/routes/(app)/sales/+page.server.ts`,
`web/src/routes/(app)/sales/+page.svelte`, `e2e/tests/sale.e2e-spec.ts`.

### Task 1: pure util (est. ~90 lines incl. spec)
- [ ] Write failing specs in `sale-math.spec.ts`, nested describes per condition: clean price,
      non-clean price (33, 499, 1007), zero invest, invest above proceeds (negative net),
      zero price; and "when compared with the stored profit" asserting
      `computeSaleBreakdown(...).net === saleNet({ profit: (price * 88) / 100, invest })` with
      `toBe` (exact, not `toBeCloseTo`).
- [ ] Implement `computeSaleBreakdown` exactly as in the spec: `(listedPrice * (100 -
      commissionPercent)) / 100`, same operation order as backend `computeProfit`.
- [ ] Run web vitest.

### Task 2: SaleProfitBlock component (est. ~80 lines)
- [ ] Props `{ listedPrice, invest, commissionPercent }`; derive breakdown; render `MathBlock`
      with lines Listed price, minus Commission (label includes the percent), minus Ticket
      invest; result "Net profit". Labels and optional "Net proceeds" line per Stitch (Q5).
- [ ] No math or formatting in the page; PSG-90 will mount this component unchanged.
- [ ] `svelte-check` clean.

### Task 3: load data (est. ~20 lines)
- [ ] In `+page.server.ts` fetch `/sales/commission` (92a) and return `commissionPercent`.
      Add the response type. If fallback A: import the constant instead, no fetch.

### Task 4: drawer wiring (est. ~120 lines changed)
- [ ] Track draft `listedPrice` and `invest` through `oninput` on the numbers form (inputs stay
      uncontrolled, submission unchanged); reset when `editSale.id` changes; non-finite or
      empty parses to 0 (Q4).
- [ ] Mount `SaleProfitBlock` after the inputs, only for the statuses decided in Q3.
- [ ] Layout and tokens per Stitch screen db96881ba7474605bc9ba0dc0c66685b. Do not copy the
      "Parc des Princes ledger" note. Keep existing region names, button names and `aria-label`
      values (e2e depends on them). Banned wording from the redesign brief still applies.
- [ ] Manual check: open a SOLD sale, the block's net equals the row net and the PSG-87 header
      net; type a new price, block updates, save, row net equals the block value.

### Task 5: e2e (est. ~30 lines)
- [ ] Extend `e2e/tests/sale.e2e-spec.ts`: open drawer, assert block visible, change price,
      assert the net text, save, assert the ledger row net equals it.

### Verify (qa-verifier)
- Web: `npm run check`, `npm test` in `web/`, e2e sale spec. Build must emit output, not just
  exit 0.

## Independence
92a (backend only) and the util/component part of 92b (Tasks 1 and 2) have no dependency and
can run in parallel. Tasks 3 and 4 need the endpoint contract only (`{ commissionPercent:
number }`, fixed in this plan), so with the contract agreed the builders can run in parallel and
integrate at e2e. Strictly, merge order is 92a, 92b, then PSG-90.
