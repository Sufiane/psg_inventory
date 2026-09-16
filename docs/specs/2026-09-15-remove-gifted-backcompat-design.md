# Remove GIFTED Back-Compat Scaffolding — Design

**Date:** 2026-09-15
**Status:** Approved
**Branch:** `remove-gift-status-backcompat`
**Removes scaffolding added by:** `869653e` / `66feaf2` — *feat(sales): add GIFTED sale status with normalized gift recipients*
**Feature spec of record (still authoritative for behaviour):** `docs/specs/2026-09-11-gifted-sale-status-design.md`

## Problem

The GIFTED feature shipped with scaffolding whose only job was to let old and new
code, and old and new cached data, coexist through the rollout:

- a deprecated `sold` boolean on `UpdateSaleDto`, kept so a web build that predated
  `status` could still flip a sale;
- `:v2` suffixes on four Redis cache keys, so a warm pre-migration entry could not be
  read back under the new payload shape;
- a `flattenGift()` shim that reshaped the new joined `Gift` row back into the
  pre-normalization flat `giftedAt` / `Recipient` pair, so the API could deploy
  without a matching web deploy;
- optional (`?`) gift fields and `?? '—'` fallbacks in `web/`, written when the API
  might not yet be sending those fields, and when a gift might not yet have a
  recipient;
- comments that narrate the migration window and, in one case, assert something that
  is no longer true.

The feature is merged, deployed, and its migration has run in production. None of
that scaffolding has a live job left. It is now pure maintenance cost: every reader
of `SalesService.updateSale` has to work out that `sold` is dead, and every reader of
the wire types has to work out that the flat shape is not the storage shape.

## Goal

Delete the scaffolding. No behaviour change is intended other than the deliberate
wire-shape change in **D2** below. No new functionality. No database migration.

## Non-goals

- Changing gift semantics, transition rules, the kickoff guard, or accounting buckets.
- Touching `scripts/ungift-sale.ts` or `scripts/verify-gift-constraints.sql` — the
  sanctioned repair path and the constraint proof are live tools, not scaffolding.
- Removing the `intent` / `previousStatus` / `currentStatus` hidden form fields. They
  disambiguate which form submitted and whether a status genuinely changed; they are
  live logic that predates nothing.
- Fixing the pre-existing optional-by-default style of `createdAt?` / `soldAt?` /
  `cancelledAt?` in `web/src/lib/types.ts`.
- Any schema change. See **Database** below.

## Database

**No migration is required, and none is in scope.**

`gifts.recipient_id` and `gifts.gifted_at` are already `NOT NULL` in the shipped
migration `20260911120100_add_recipients_and_gifts` — the "recipient becomes
required" hardening was folded into that same migration before release rather than
added afterwards. There is therefore no app-level null handling in this change that
is propped up by a nullable column, and nothing here needs a `NOT NULL` alter.

The one nullability that remains is legitimate and stays: `Sales.Gift` is
`Gifts?` because a non-gifted sale genuinely has no gift row.

## Decisions

### D1 — Cache keys revert to un-versioned

The four keys bumped by the feature go back to their pre-GIFTED spelling:

| Key | After |
|---|---|
| `sale` | `sale:id:{saleId}` |
| `sales` | `user:id:{userId}:sales` |
| `salesByRange` | `user:id:{userId}:sales:start:{from}:end:{to}` |
| `accounting` | `accounting:user:id:{userId}:start:{start}:end:{end}` |

The `:v2` explanatory comment on `sale` goes with them.

**Stated assumptions, accepted by the user:**

1. The cache is effectively empty — there is no warm entry worth protecting.
2. A rollback of the GIFTED feature itself is ruled out, so no pre-GIFTED build will
   ever write the un-versioned keys again.

Because of (1) and (2), no production `invalidatePattern` / flush step is needed
before or after this deploy, and none is specified. If either assumption stops
holding, this decision must be revisited before shipping.

**Known bounded consequence, no action taken:** `invalidateSales`
(`user:id:{userId}:sales*`) and `invalidateAccounting` (`accounting:user:id:{userId}:*`)
are patterns and clear both generations, but `CACHE_KEYS.sale(id)` is an *exact* key.
For the duration of the rolling deploy only, a write served by a new pod clears
`sale:id:{id}` while an old pod may keep serving a stale `sale:id:{id}:v2` until its
one-hour TTL expires. It is self-healing and needs no runbook step.

A regression test is added alongside the change: `invalidateSales(userId)`'s prefix
must cover the keys `sales` and `salesByRange` write under. It mirrors the existing
`invalidateMatches` test in `src/redis/CACHE_KEYS.spec.ts`. It deliberately does not
assert anything about `sale:id:*`, which lives in another namespace and is
invalidated key-by-key on purpose.

### D2 — `flattenGift()` is deleted; the gift is served nested

`GET /sales/:id` and the list endpoints stop flattening the gift row onto the sale.
`Gift` goes out on the wire as it is stored and queried:

```
Gift: { giftedAt, recipientId, Recipient: { id, name } } | null
```

Consequences in the API layer:

- `flattenGift()` is deleted.
- `SaleResponse` is deleted. `getSale` returns `Sale`.
- `FormattedSale` derives from `Sale` directly:
  `Omit<Sale, 'Match' | 'userId' | 'matchId'> & { opponent; matchDate }`.
- `formatSale` omits from the sale itself rather than from a flattened copy.
- The `saleQuery` comment that promises the api flattens `Gift` back onto the sale is
  corrected — it no longer does.

**This is a breaking wire change, chosen with its cost understood.** The API
(Railway) and the web app (Cloudflare) deploy independently, so for the duration of
the rollout window one side will be reading a shape the other is not sending, and
gift rendering — the recipient name on the sale detail page and in the edit drawer —
will be missing or stale until both sides land. Neither deploy order avoids it.
Nothing outside gift rendering is affected: status, prices, allocations, accounting
and the whole import pipeline are untouched by the shape change. The user accepted
that window rather than keep a translation layer whose stated purpose — surviving a
deploy window that has already passed — no longer applies. This is a deliberate
trade, not an oversight.

### D3 — The deprecated `sold` alias is hard-removed

Deleted: `UpdateSaleDto.sold`, the now-unused `IsBoolean` import, the
`resolveTargetStatus()` helper (with `payload.status` read directly at its one call
site), and the two `describe` blocks in `src/api/sales/sales.service.spec.ts` that
exercise the alias.

`status` is the only way to move a sale's status. Its optionality stays and is not
part of this change: an absent `status` means "leave the status alone", which is what
the edit-numbers form relies on.

No deploy-ordering note is warranted. The deployed web build already sends `status`
from every form, and nothing else in the repo or outside it sends `sold`. (For the
record: the global `ValidationPipe` runs `whitelist: true` without
`forbidNonWhitelisted`, so a hypothetical stale client sending `sold` would have it
silently stripped and get a 200 that changed no status. That path is unreachable in
practice, which is why it is documented here and not defended against in code.)

### D4 — `web/` types tighten and the dead fallbacks go

`SaleListItem` and `SaleDetail` lose the optional `giftedAt?` / `Recipient?` pair and
gain a single required-but-nullable `Gift: SaleGift | null`, where
`SaleGift = { giftedAt: string; recipientId: string; Recipient: SaleRecipient }`.
`Recipient` inside `Gift` is non-nullable: `gifts.recipient_id` is `NOT NULL`, so a
gift without a recipient is not representable.

This makes the gift field stylistically inconsistent with its optional neighbours
(`createdAt?`, `soldAt?`, `cancelledAt?`) in the same types. That is accepted; those
neighbours are out of scope.

With `Gift` carrying its own existence, the three `?? '—'` / `?? 'Name'` fallbacks
for "a GIFTED sale with no recipient" become unreachable and are deleted. Where a
recipient is rendered, the gate changes from `{#if sale.status === 'GIFTED'}` to
`{#if sale.Gift}` so the narrowing is honest and no fallback is needed to satisfy the
type checker. Gates that control *the form's availability* stay status-driven — the
gift form is offered for a `PENDING` pre-kickoff sale that has no `Gift` yet, so
`editSale.status === 'GIFTED' || (editSale.status === 'PENDING' && !isPastMatch)` is
unchanged.

The dead `UpdateSalePayload` type in `web/src/lib/types.ts` is deleted whole, not
just its `sold` field: it has no references anywhere in `web/`.

### D5 — Comment cleanup

Two kinds, both in code this change already touches:

1. **A comment that is now false.** `isKickoffGuarded`'s preamble in
   `src/api/sales/sales.service.ts` justifies the `GIFTED -> GIFTED` kickoff
   exemption by claiming CSV-imported gifts are "past-match with `recipientId = null`
   by construction". They are not — the import requires a recipient. The exemption
   itself is correct and stays; the reason is rewritten to the true one (attaching or
   correcting a recipient is not a decision that has to precede the match).
2. **Migration-window narration.** The "it used to fall through and return 200 having
   written nothing", "that inference is what broke this three times over" and
   "kept one release so the web app and the api can deploy independently" passages in
   `src/api/sales/sales.service.ts` and both `read-payload.ts` files are trimmed to
   the load-bearing why — why the guard exists, not the history of how it got there.
   That history stays in the commit messages and in
   `docs/specs/2026-09-11-gifted-sale-status-design.md`.

No comment is added that restates what the code says.

## Scope: file by file

**Backend — no wire change (independent of everything else):**

| File | Change |
|---|---|
| `src/api/sales/dto/update-sale.dto.ts` | delete `sold` + `IsBoolean` import (D3) |
| `src/api/sales/sales.service.ts` | delete `resolveTargetStatus`; read `payload.status`; comment cleanup (D3, D5) |
| `src/api/sales/sales.service.spec.ts` | delete the two `sold`-alias `describe` blocks (D3) |
| `src/redis/CACHE_KEYS.ts` | four keys un-versioned, `:v2` comment deleted (D1) |
| `src/redis/CACHE_KEYS.spec.ts` | new `invalidateSales` coverage test (D1) |

**Backend — the wire change:**

| File | Change |
|---|---|
| `src/api/sales/interfaces/sales.service.interface.ts` | delete `SaleResponse`; `FormattedSale` derives from `Sale`; `getSale` returns `Sale` (D2) |
| `src/api/sales/sales.service.ts` | delete `flattenGift`; `getSale` and `formatSale` pass `Gift` through (D2) |
| `src/api/sales/sales.service.spec.ts` | the two "flattens the gift" tests assert nested passthrough instead (D2) |
| `src/db/sales/sales.query.ts` | correct the "the api layer flattens it back" comment (D2) |

**Frontend — depends on the wire change:**

| File | Change |
|---|---|
| `web/src/lib/types.ts` | `SaleGift`; `Gift` replaces `giftedAt?`/`Recipient?`; delete dead `UpdateSalePayload` (D2, D4) |
| `web/src/routes/(app)/sales/[saleId]/+page.svelte` | gate on `sale.Gift`, read `sale.Gift.Recipient.name`, drop `?? '—'` (D4) |
| `web/src/routes/(app)/sales/+page.svelte` | same in the edit drawer; placeholder becomes `editSale.Gift?.Recipient.name ?? 'Name'` (D4) |

**Frontend — independent of the wire change:**

| File | Change |
|---|---|
| `web/src/routes/(app)/sales/read-payload.ts` | trim the narrative docstring (D5) |
| `web/src/routes/(app)/sales/[saleId]/read-payload.ts` | trim the narrative docstring (D5) |

Neither `read-payload.spec.ts` asserts anything about the sale shape — they operate on
`FormData` only — so they need no change under D2.

## Testing

No new behaviour, so the test work is deletion and re-pointing, not new coverage:

- Delete the two `sold`-alias `describe` blocks. Everything else in
  `sales.service.spec.ts` already drives `status`.
- Re-point the two flattening tests at the nested shape: `getSale` returns the sale
  with its `Gift` intact; a non-gifted sale returns `Gift: null`; `getSales` returns
  each row's `Gift` unflattened. These are the regression net for D2 and must be
  written before the shim is deleted.
- Add the `CACHE_KEYS.invalidateSales` coverage test (D1).
- Frontend: `read-payload` specs are untouched; `npm run check` is the real gate on
  D4, since the type tightening is what proves the fallbacks were dead.

Gates, per existing convention: backend `npm run lint -- --max-warnings 0`,
`npm run typecheck`, `npm test`; frontend `cd web && npm run check && npm test`. All
must pass at the end of every task.

Tests follow the house structure: a `describe` per condition, `it` titles stating
only the outcome.

## Risks

| Risk | Handling |
|---|---|
| Gift rendering breaks during the rollout window (D2) | Accepted deliberately; both deploy orders have the same window; nothing outside gift rendering is affected |
| A stale `sale:id:{id}:v2` served by an old pod mid-deploy (D1) | Bounded by the one-hour TTL, self-healing, no step taken |
| A stale un-versioned accounting entry lacking the `gifted` bucket (D1) | Excluded by the stated "cache is effectively empty" assumption; bounded by the one-day TTL otherwise |
| A client still sending `sold` (D3) | None exists; the whitelist-strip outcome is documented in D3 rather than defended in code |
| Deleting `UpdateSalePayload` removes something in use | `npm run check` proves otherwise; it has zero references |

## Out of scope, noted for later

- `src/api/sales/sales.service.ts` is doing a lot: routing three write intents,
  resolving recipients, and guarding transitions. The project convention would extract
  `updateSale` into a usecase (`sales/usecases/update-sale/`). That is a real
  refactor with its own tests, not a deletion, and mixing it into this change would
  bury what is being removed. Left for a follow-up.
