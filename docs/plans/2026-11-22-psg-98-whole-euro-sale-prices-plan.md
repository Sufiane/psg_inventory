# PSG-98 whole-euro sale prices: implementation plan

Spec: `docs/specs/2026-11-22-psg-98-whole-euro-sale-prices-design.md`. Option A.

Size: ~170 lines, one PR under the 800 cap (backend ~45, web ~125). Tasks 1 (backend) and
2-4 (web) are independent and can be dispatched in parallel or split into two slices.
No schema change, no migration.

Conventions: explicit return types, no inline `if`, vitest `describe('when ...')` nesting,
conventional commit `fix(sales): reject decimal prices (PSG-98)`.

## Task 1 (backend): integer validation on AddSaleDto / UpdateSaleDto

Files: `src/api/sales/dto/add-sale.dto.ts`, new `src/api/sales/dto/add-sale.dto.spec.ts`.

1. Write the spec first using `plainToInstance` + `validate` from class-validator. Structure:
   - describe `when listedPrice is a fraction` : it rejects (AddSaleDto and UpdateSaleDto)
   - describe `when invest is a fraction` : it rejects (both DTOs)
   - describe `when both are whole numbers` : it accepts; invest 0 accepted
   - describe `when listedPrice is 0` : it rejects (Min 1)
   Valid fixture: matchId string, one allocation (check `sale-allocation.dto.ts` for fields).
2. Run: fails for fractions (IsNumber accepts them).
3. Add `IsInt` import; replace `@IsNumber()` with `@IsInt()` on `invest` and `listedPrice`
   (drop unused `IsNumber` import).
4. Run backend unit tests and lint; spec passes.

## Task 2 (web): preview refuses fractions

Files: `web/src/lib/sale-math.ts`, `web/src/lib/sale-math.spec.ts`.

1. Tests first: `parseAmount('33.5')` returns null; `parseAmount('33')` returns 33;
   `parseAmount('')` null; `computeDraftBreakdown(33.5, 0, 12)` null; `(33, 0, 12)` non-null.
2. `parseAmount`: return `Number.isInteger(value) ? value : null`.
3. `computeDraftBreakdown`: add `!Number.isInteger(listedPrice)` and
   `(invest !== null && !Number.isInteger(invest))` to the null guard.
4. Run web vitest.

## Task 3 (web): server-side rejection

Files: `web/src/routes/(app)/sales/read-payload.ts` (+ `read-payload.spec.ts`),
`web/src/routes/(app)/sales/[saleId]/read-payload.ts`,
`web/src/routes/(app)/sales/+page.server.ts` (create action),
`web/src/routes/(app)/sales/new/+page.server.ts`.

1. Tests first in `read-payload.spec.ts` for the `/sales` payload reader: describe
   `when listedPrice is 33.5` returns error `Listed price must be a whole number of euros.`;
   describe `when invest is 2.5` returns `Invest must be a whole number of euros.`.
   Add the same cases for `[saleId]/read-payload.ts` if a spec exists, else create a minimal one.
2. In both read-payload files add `!Number.isInteger(value)` branch (own `if`, own message)
   before the range check, for `listedPrice` and `invest`.
3. In the two `+page.server.ts` create actions add equivalent guards after the `isFinite`
   checks (same messages). No server-action unit tests exist; cover through the e2e in task 5
   or manual check.
4. Run web vitest and svelte-check.

## Task 4 (web): inputs

Files: `web/src/routes/(app)/sales/+page.svelte` (edit drawer lines ~631/655, new-sale panel
~877/889), `web/src/routes/(app)/sales/new/+page.svelte` (~120/132),
`web/src/routes/(app)/sales/[saleId]/+page.svelte` (~139/152).

1. Replace `step="0.01"` with `step="1"` and add `inputmode="numeric"` on those 8 inputs.
2. `ImportSalesDraft.svelte` inputs already default to step 1: no change.
3. Run `svelte-check`; manually confirm in the app that typing 33.5 shows dashes in the profit
   block and the browser blocks submit.

## Task 5 (verification, qa-verifier)

1. Add to `e2e/tests/sale.e2e-spec.ts` only if cheap: fill `33.5`, expect the sale not to be
   created. Remember e2e specs need `testMatch` (already registered for this file).
2. Full: backend unit + lint, web vitest + svelte-check + lint, build, `test -f dist/main.js`.

## Follow-ups (own tickets, not in this PR)

- `SaleHistories.profit` Int vs Sales.profit Float: characterise, then migrate (spec section 6).
- If fractional pricing is ever required: option B as its own multi-ticket epic.
