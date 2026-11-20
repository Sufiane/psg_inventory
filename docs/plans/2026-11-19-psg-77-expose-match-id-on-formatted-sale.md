# PSG-77 expose matchId on FormattedSale Implementation Plan

Spec: `docs/specs/2026-11-19-psg-77-expose-match-id-on-formatted-sale-design.md`.
Size: ~15 lines total, fits one PR, single ticket. Backend change plus a 2-line web type
mirror; no parallel split needed.
Repo rules: explicit return types, no barrels, no comments, nested `describe` per
condition (`it` states outcome), conventional commit `feat(sales): expose matchId on
FormattedSale (PSG-77)`, stage only, wait for `/crit`. Branch name `psg-77`.

Files: `src/api/sales/interfaces/sales.service.interface.ts`, `src/api/sales/sales.service.ts`,
`src/api/sales/sales.service.spec.ts`, `web/src/lib/types.ts`.

## Task 1: failing test (red)

- [ ] In `sales.service.spec.ts`, in the `getSalesGrouped` describe (or a new
  `describe('formatting a sale')` with `when a sale is formatted`), add
  `it('keeps the matchId')`: `expect(result.pending[0].matchId).toBe(matchId)`
  (`matchId` and `saleFixture` come from `test-support/sales.fixtures.ts`; fixture already
  sets it).
- [ ] Run `npx vitest run src/api/sales/sales.service.spec.ts`; expect the new test to fail.

## Task 2: backend (green)

- [ ] `sales.service.interface.ts`: `Omit<Sale, 'Match' | 'userId'>`.
- [ ] `sales.service.ts` `formatSale`: `omit(sale, ['Match', 'userId'])`.
- [ ] Re-run the spec; expect pass. Run `npx tsc --noEmit -p tsconfig.json` for the
  backend, `npx eslint` on the two touched src files.

## Task 3: web type mirror

- [ ] `web/src/lib/types.ts`: add `matchId: MatchId;` to `MatchSale` and `SaleListItem`
  (`MatchId` is already imported there).
- [ ] Run web type-check (`npm run check` in `web/`); expect no new errors.

## Task 4: verify and stage

- [ ] Run `npx vitest run` (unit) once; confirm `e2e/tests/sale.e2e-spec.ts` does not
  assert exact response equality on `/sales*` (grep showed no `matchId`/`matchDate`
  assertions; no change expected).
- [ ] `git add` the four files; stop and tell the user to run `/crit`.
