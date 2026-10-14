# PSG-50: reduce cognitive complexity of UpdateSaleUsecase.execute

## Problem

`UpdateSaleUsecase.execute` (`src/api/sales/usecases/update-sale/update-sale.usecase.ts`)
scores cognitive 21 / cyclomatic 24. It validates, builds the field patch, classifies the
gift intent, guards the recipient, then dispatches three intents inline. Target: cognitive <= 15
(aim <= 8).

## Constraints

- Pure behavior-preserving refactor. `update-sale.usecase.spec.ts` and
  `update-sale.usecase.db.spec.ts` stay untouched and green.
- Public surface unchanged: `IUpdateSaleUsecase.execute`, constructor deps, DI wiring.
- Check order is part of behavior and must not change: not found, legal transition,
  kickoff, allocations validation, recipient-not-applicable, then dispatch.
- Repo conventions: private helpers inside the usecase, no ORM import, explicit return
  types, no nested functions, no single-letter names, braced `if`, no new comments beyond
  moving the existing why-comments with the code they explain.

## Design

`execute` becomes: load + guard, validate allocations, build patch, classify intent, dispatch.

New private members (all in the usecase class):

- `buildFieldPatch(userId, payload)`: the `fieldPatch` object with its ternary spreads.
  Pure, sync.
- `classifyIntent(existing, payload)`: returns `'enter_gift' | 'update_gift' | 'plain'`.
  Holds `hasRecipientPayload`, `targetsExistingGift` and the
  `SALE_GIFT_RECIPIENT_NOT_APPLICABLE` throw. Throws before any db write, same as today.
- `enterGift(context)`: the `giftSale` branch (resolve new recipient, null -> SALE_NOT_FOUND,
  `afterWrite({ recipientChanged: true })`).
- `updateExistingGift(context)`: the `updateGift` branch (resolve existing recipient,
  null -> SALE_NOT_FOUND, `recipientChanged` computed against `existing.Gift?.recipientId`).
- `updatePlainSale(context)`: the `updateSale` branch (status passthrough,
  `'not_found'` -> SALE_NOT_FOUND, `recipientChanged: false`).

`context` is a file-local type `{ userId, payload, existing, fieldPatch }`, so helper
signatures stay at one argument and there are no same-typed positional params.

Dispatch in `execute` is a `switch` on the intent (one cognitive point), no default
branch: the three-literal union is exhausted.

Estimated scores: `execute` ~4, `classifyIntent` ~8, `buildFieldPatch` ~6, each branch
helper ~2. All under 15.

Module-level helpers (`assertLegalTransition`, etc.) are untouched.

## Ratchet (eslint.config.mjs, currently 27)

Per `docs/tech-debt.md`, `resolveDraftRows` (27, PSG-49) and `validateCommitRows` (23)
in `sales-import.resolver.ts` still outscore everything else. After this ticket the max
is still 27, so the true new max equals the current value: **no eslint change in this
PR**. The ratchet moves only once PSG-49 lands (new max 23 until `validateCommitRows` is
also reduced). The `docs/tech-debt.md` entry is updated: drop `UpdateSaleUsecase.execute (21)`
from the list of offenders and note PSG-50 done.

Measurement caveat: worktree has no `node_modules`, so scores above for the new code are
estimates; the plan measures them with eslint at threshold 15 before claiming done.

## Out of scope

- Splitting the usecase further or moving db methods (existing narrow-interface note stays).
- Lowering the ratchet to 15 (PSG-51).
- Any spec rewrite.

## Risks

- Reordering checks would change which error wins; the plan keeps order and the existing
  spec covers precedence (transition before kickoff, recipient guard before writes).
- `fieldPatch` is built before the recipient guard today; moving it is harmless (pure)
  but build it in the same position anyway.
