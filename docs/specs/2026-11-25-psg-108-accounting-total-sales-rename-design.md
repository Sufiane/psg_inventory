# PSG-108 Accounting `totalSales` misnomer (backend) - design

Origin: `docs/tech-debt.md` entry "`totalSales` is a listed-price sum, rendered as a count", found during PSG-88
(`docs/specs/2026-11-25-psg-88-dashboard-proceeds-chart-per-ticket-figures-design.md`, section 7).
Backend half only. Web half is PSG-109 (blocked by this ticket).

## 1. Problem

`Accounting.totalSales` is `sum(listedPrice)` (`format-aggregate.util.ts`) and is branded `SaleCount`, so the
type and the name both lie. The Ask feature already works around it (`build-context.ts` double-casts it to
`totalListedValue`).

## 2. Decision: rename AND add a count (not either alone)

- Rename only: leaves web with no sale count. `totalNbTickets` is a ticket count, not a sale count, so the
  Dashboard "N sales" tiles would be wrong for multi-ticket sales. Reject.
- Add `salesCount` only, keep `totalSales` as value: the name keeps lying and the next reader trips again. Reject.
- Do both: `totalSales` becomes `totalListedValue` (brand `TotalListedValue`, already in `@psg/shared/money`,
  same name `AskAccounting` uses) and a real `salesCount` (brand `SaleCount`, which is finally correct)
  comes from the same Prisma `aggregate` via `_count: { _all: true }`. No extra query, about 15 lines of
  production code. Splitting would only add a second PR touching the same four files.

## 3. Shape change

`Accounting` / `FormattedAggregate`: `totalSales: SaleCount` is replaced by `totalListedValue: TotalListedValue`
and `salesCount: SaleCount`. `AccountingAggregate` gains `_count: { _all: number }`; `AggregatePayload`
gains `count: number`. `AccountingDb.getAccounting` adds `_count: { _all: true }`. Cast to `SaleCount` stays at the
boundary: `formatAggregate` already casts there today, `_count` is a raw Prisma int so the brand is applied once
in the usecase-to-formatter step (same convention as the other aggregate fields). The `null` early return
(`_sum.listedPrice === null`) is unchanged, so an empty bucket is still `null`, not `salesCount: 0`.

Ask: `build-context.ts` reads `raw.totalListedValue` directly. Both double-cast and its comment disappear.
`AskAccounting` does not get `salesCount` (out of scope, new feature if wanted).

## 4. Cache and stale values

`TimePeriodAccounting` is cached in Redis for `ONE_DAY_TTL` under `accounting:user:id:<id>:start:...:end:...`
(`CACHE_KEYS.accounting`, read through `redisService.get` in `get-season-accounting.usecase.ts`). Nothing
invalidates on deploy, so after release up to 24 h of hits return the old shape (`totalSales`, no `salesCount`,
no `totalListedValue`). The web would render `0` / `NaN`. Fix: version the key.

- `CACHE_KEYS.accounting` and `CACHE_KEYS.amortization` move to the `accounting:v2:user:id:` prefix and
  `invalidateAccounting` to `accounting:v2:user:id:<id>:*`. Amortization shape is unchanged, but it shares the
  invalidation namespace, so it moves with it (recomputed once, harmless).
- Old `accounting:user:id:*` keys are orphaned and expire on their own within 24 h. No flush script.
- Rule for the future: any change to a cached type bumps the version segment. Not adding a generic mechanism
  now (YAGNI).

## 5. Rollout and compatibility

Backend and web deploy separately. Between backend release and PSG-109 release the web reads `totalSales`
(undefined): Dashboard / Accounting tiles show 0 via their `?? 0`, `AccountingCard` money lines show
`NaN`/blank, `sale-math.ts` cancelled count shows 0. Single-user app, window is minutes if PSG-109 is merged
right after. Chosen: no deprecated `totalSales` alias (an alias needs a third cleanup ticket and keeps the lie in
the contract). Open decision D1 if the owner prefers zero-downtime: keep the alias for one release.

## 6. Web consumers for PSG-109 (do not touch here)

| File | Use today | After |
|---|---|---|
| `web/src/lib/types.ts:173` | `totalSales: SaleCount` | `totalListedValue: TotalListedValue`, `salesCount: SaleCount` |
| `web/src/lib/sale-math.ts:112` | cancelled count = `unrealized.totalSales - gifted.totalSales` (count, wrong) | `salesCount` difference |
| `web/src/lib/sale-math.spec.ts:31` | fixture | update |
| `web/src/lib/ui/AccountingCard.svelte:86,105` | `money(data.totalSales)` (correct use, value) | `totalListedValue` |
| `web/src/routes/(app)/dashboard/+page.svelte:64-65` | gifted / pending counts | `salesCount` |
| `web/src/routes/(app)/accounting/+page.svelte:109` | "`{pending.totalSales} tickets`" | `salesCount` with "sales" wording, or `totalNbTickets` if tickets is meant |
| `web/src/routes/+page.server.ts:112` | stale comment about misnaming | delete |

The web showcase cache in `+page.server.ts` stores derived figures (`soldCount` from `totalNbTickets`), not the
raw payload, so it needs no versioning. PSG-109 should check that wording ("tickets" vs "sales") per tile.
Also related, not in either ticket: `averageTicketPrice` is avg per sale, not per ticket (PSG-88 follow-up 2).

## 7. Out of scope

Web changes (PSG-109); `salesCount` in Ask context; `averageTicketPrice` relabel. On merge, delete the
tech-debt entry for `totalSales` only when PSG-109 also lands (leave it, edit to "backend done").

## 8. Tests

- `format-aggregate.util.spec.ts`: expected object has `totalListedValue` and `salesCount` from `count`.
- `get-season-accounting.usecase.spec.ts`: fixtures use new fields; aggregate mock includes `_count`; formatter
  called with `count`.
- `build-context.spec.ts`, `ask-question.usecase.spec.ts`: fixtures renamed.
- `CACHE_KEYS.spec.ts`: v2 prefix for accounting, amortization and the invalidation pattern.
- No db spec exists for `AccountingDb`; add one small test that `getAccounting` passes `_count: { _all: true }` to
  `prisma.sales.aggregate` (mock pattern as in `sales.db.spec.ts`). Check whether an int-spec tier covers it
  (PSG-102 added one); if so extend it with a count assertion.

## 9. Size

About 110 lines total (about 45 production, 65 tests), one layer, one actor. One PR, far under the 800 cap.
