# PSG-103 decimal price hint: implementation plan

Spec: `docs/specs/2026-11-24-psg-103-decimal-price-hint-design.md`.

Size: ~100 lines, single PR under the 800 cap. No ticket split needed. Task 1 (backend) and
tasks 2-3 (web) are independent, disjoint files, parallel-safe.

Conventions: explicit return types, no inline `if`, blank line before `if`/`return`, vitest
`describe('when ...')` nesting with short `it` titles, snake_case error codes, no comments unless
non-obvious. Commit: `feat(web): show whole-euro hint for decimal sale prices` (branch `psg-103`).

## Task 1 (backend, ~15 lines): clear integer error codes

Files: `src/api/sales/dto/add-sale.dto.ts`, `src/api/sales/dto/add-sale.dto.spec.ts`.

1. Extend the existing `describe.each` spec. In `when listedPrice is a fraction` add an `it`
   `reports listed_price_must_be_integer` that runs `validate(plainToInstance(...))` and asserts
   the error for `listedPrice` has `constraints.isInt === 'listed_price_must_be_integer'`.
   Same for invest with `invest_must_be_integer`. Run: fails (default message).
2. `@IsInt({ message: 'listed_price_must_be_integer' })` on `listedPrice`,
   `@IsInt({ message: 'invest_must_be_integer' })` on `invest`. Do not touch `@Min`.
3. Run backend unit tests + lint. Pass.

## Task 2 (web, ~40 lines): `wholeEuroHint` helper

Files: `web/src/lib/whole-euro.ts`, `web/src/lib/whole-euro.spec.ts`.

1. Failing tests first, describe blocks:
   - `when the raw value is empty or whitespace` returns null
   - `when the raw value is a whole number` (`'33'`, `'33.0'`, `'1e2'`, `'0'`) returns null
   - `when the raw value is a decimal` (`'33.5'`, `'0.01'`, `'-2.5'`) returns `'Whole euros only.'`
   - `when the raw value is not a number` (`'abc'`) returns null
2. Implement:
   ```ts
   export const WHOLE_EURO_HINT = 'Whole euros only.';

   export function wholeEuroHint(raw: string): string | null {
       if (raw.trim() === '') {
           return null;
       }

       const value = Number(raw);

       return Number.isFinite(value) && !Number.isInteger(value) ? WHOLE_EURO_HINT : null;
   }
   ```
3. Run `web` vitest; pass.

## Task 3 (web, ~45 lines): render hints in the edit drawer

File: `web/src/lib/ui/SaleEditPanel.svelte` only.

1. Import `wholeEuroHint`. Add
   `let listedPriceHint = $derived(wholeEuroHint(draftListedPrice));` and
   `let investHint = $derived(wholeEuroHint(draftInvest));` beside the other drafts (~line 65).
2. Listed price input: add
   `aria-describedby={listedPriceHint ? \`edit-listed-price-hint-${layout}\` : undefined}`.
   After the `relative` div add
   `{#if listedPriceHint}<p id="edit-listed-price-hint-{layout}" class="text-xs text-negative">{listedPriceHint}</p>{/if}`
   (format multi-line like the existing pass-cost hint).
3. Invest input: build the describedby from a list of present ids (`edit-invest-hint-{layout}`
   for `passCostHint`, `edit-invest-whole-hint-{layout}` for `investHint`), joined by a space,
   `undefined` when empty; use a `$derived`, not an inline expression. Render the whole-euro
   hint `<p>` above the pass-cost hint.
4. No change to `SaleProfitBlock`, `parseAmount`, or the three create forms.
5. Add an e2e step in `e2e/tests/sale.e2e-spec.ts` only if it already has an edit-drawer test
   to extend: type `33.5` into Listed price, expect `Whole euros only.` visible; type `33`,
   expect it hidden. Confirm file is in `e2e/playwright.config.ts` `testMatch` (it is a
   known pitfall). Skip if no drawer test exists; unit coverage is sufficient.
6. Run `npm run check` / lint / vitest in `web/`. Manually: open drawer, type `33.5`: hint shows
   under the field and dashes remain; type `33`: hint gone, profit block fills.

## Out of scope tickets (file in Linear, team PSG Inventory, assignee me, if wanted)

- Same hint on the three create forms (needs controlled inputs).
