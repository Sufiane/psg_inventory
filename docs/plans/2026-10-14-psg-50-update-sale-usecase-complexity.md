# PSG-50 plan: reduce UpdateSaleUsecase.execute cognitive complexity

Spec: docs/specs/2026-10-14-psg-50-update-sale-usecase-complexity-design.md

Size: ~+60/-40 lines in one source file, ~5 lines docs. Fits one PR, backend-only, no split.

Rules: existing specs untouched. Commit type `refactor(sales): ...`, lowercase imperative.
Branch must be named `psg-50` (already is).

## Task 0: baseline

- [ ] `npm ci` in the worktree (no node_modules present).
- [ ] `npx jest src/api/sales/usecases/update-sale` : record green baseline.
- [ ] Measure: `npx eslint src/api/sales/usecases/update-sale/update-sale.usecase.ts --rule '{"sonarjs/cognitive-complexity":["error",0]}'`
      and record the `execute` score (expect 21).

## Task 1: extract buildFieldPatch

- [ ] Add `private buildFieldPatch(userId: UserId, payload: UpdateSaleDto)` returning the
      current `fieldPatch` object literal verbatim. Infer-free explicit return type: derive
      it from the db input type (e.g. a named type exported by `update-sale.usecase.db.ts`
      if one exists; otherwise declare a local `FieldPatch` type matching the literal).
- [ ] Replace inline literal with call. Run the update-sale specs: green.

## Task 2: extract classifyIntent

- [ ] Add local `type UpdateIntent = 'enter_gift' | 'update_gift' | 'plain'`.
- [ ] Add `private classifyIntent(existing: Sale, payload: UpdateSaleDto): UpdateIntent`
      containing `hasRecipientPayload`, `targetsExistingGift`, the NOT_APPLICABLE throw
      (move the two existing why-comments with it). Return `enter_gift` when
      `target === 'GIFTED' && existing.status !== 'GIFTED'`, `update_gift` when
      `targetsExistingGift`, else `plain`. Evaluate the NOT_APPLICABLE guard first, as today.
- [ ] Run specs: green.

## Task 3: extract the three branch helpers

- [ ] Add local `type UpdateContext = { userId: UserId; payload: UpdateSaleDto; existing: Sale; fieldPatch: FieldPatch }`.
- [ ] Add `private async enterGift(context: UpdateContext): Promise<void>`,
      `updateExistingGift(...)`, `updatePlainSale(...)`, each moving its branch body
      verbatim (keep the "Entry always moves a gift count" and spec D15 comments with the
      code they explain). Remove `return;` statements.
- [ ] `execute` ends with `switch (intent)` calling `await this.<helper>(context)` per case.
      No default branch needed (union exhausted); confirm TS passes under the project's
      `noImplicitReturns` / explicit `Promise<void>`.
- [ ] Run specs: green, untouched (`git diff --stat` shows no spec files).

## Task 4: verify and measure

- [ ] Re-run the eslint measurement: every function in the file <= 15, `execute` <= 8.
- [ ] `npm run lint`, `npm run build` and `test -f dist/main.js` (exit 0 is not evidence),
      full `npx jest`.
- [ ] Find the true repo max: eslint with threshold 26 across `src`; expect it still fails
      only on `resolveDraftRows` (27). If so, leave `eslint.config.mjs` at 27. If
      PSG-49 has merged to main before this lands and max dropped, set the ratchet to that
      exact max (not 15; PSG-51 owns that).

## Task 5: docs

- [ ] `docs/tech-debt.md` ratchet entry: remove `UpdateSaleUsecase.execute (21)` from the
      offender list ("Two functions above 15"), mention PSG-50 resolved.
- [ ] Stage, do not commit. Tell user to run `/crit`. Linear PSG-50 -> In Review only then.
