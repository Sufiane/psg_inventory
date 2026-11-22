# PSG-101: fix gifted-sale e2e row locator

Size: XS (~10 lines, 1 file, test-only). Fits one PR; no split. Combined spec+plan (no separate design doc).

## Root cause (confirmed by reading, spec not run locally)

Original hypothesis (default status tab hides gifted sales) is WRONG:
`parseStatusParam` in `web/src/lib/sales-view.ts` defaults to `'all'`, and `filterByStatus('all')` returns every sale. The default tab shows gifted rows.

Real cause: PSG-82 (commit daf9de8) renders GIFTED rows without the listed price. In `web/src/routes/(app)/sales/+page.svelte` (~line 947) a gifted row emits `<td colspan="3">Gifted to {recipient}</td>` instead of the price and invest cells (mobile card does the same, ~line 884). The spec's `saleRow(page, '502')` locator is `/E2E Test FC.*502/`; once the sale is gifted, "502" is no longer in the row text, so the row is never found (line 105-107). Same locator at line 121 (`toHaveCount(0)`) now passes vacuously, so it no longer proves the delete worked.

Not a product bug: hiding price on gifted rows is deliberate PSG-82 design (gifts have no price/profit).

## Change

File: `e2e/tests/sale.e2e-spec.ts` only.

1. Add a helper next to `saleRow`:
   `giftedRow(page, recipient)` returning `page.getByRole('row', { name: new RegExp(`${E2E_OPPONENT_NAME}.*Gifted to ${recipient}`) })`.
2. Line 105: `const giftedRow = giftedRow(...)` (rename local to avoid shadowing, e.g. `giftedSaleRow`); keep `toContainText('GIFTED')`.
3. Line 121: assert `giftedRow(page, RECIPIENT_NAME)` has count 0 after delete.
4. Update the top-of-file comment on distinct per-scenario identifiers: gift scenario is identified by price while PENDING, by recipient once GIFTED.

Parallel safety: recipient "E2E Recipient" is only used by the gift test; the SOLD test never gifts. No tab switching needed (default tab is All).

## Audit of other specs

- `accounting`, `dashboard`, `matches`, `season-pass`, `auth`: none visit `/sales`, none use `status=`/`season=` params or look up sale rows. No default-tab/season assumption found.
- `sale.e2e-spec.ts` SOLD test (line 39-84): already uses status tabs explicitly and matches by price on PENDING/SOLD rows, which still render price. Unaffected.
- Season filter: `createSale` redirects to `/sales` with default season (current); seeded match is 30 days out, so within the current season except near a season boundary (Jun/Jul). Latent risk only, out of scope; mention in PR if desired.

## Tasks

1. Edit `e2e/tests/sale.e2e-spec.ts` per above.
2. Verify: `cd e2e && npx tsc --noEmit` (CI typechecks specs), then run the gift scenario per CI recipe (`.github/workflows/ci.yml` e2e job: seed via `npm run local:db:seed:e2e`, build/preview web on :4173, `npx playwright test sale`). Confirm both sale tests pass.
3. Commit: `fix(e2e): locate gifted sale row by recipient (PSG-101)`.

## Notes

- CI e2e has been red on main for several commits (PSG-87, PSG-85, PSG-91 pushes all failed), consistent with a single cause since PSG-82; the recent run on main in progress should go green after this fix. Worth checking other failing jobs in those runs if it stays red.
