# PSG-109 Web: bind accounting count tiles to `salesCount`, money to `totalListedValue` - design

Origin: PSG-108 (merged) replaced `Accounting.totalSales` with `totalListedValue: TotalListedValue` (money) and
`salesCount: SaleCount` (real count), no alias. Spec: `docs/specs/2026-11-25-psg-108-accounting-total-sales-rename-design.md`
section 6. Web currently reads the missing `totalSales`: count tiles show 0, `AccountingCard` money shows NaN.
Frontend only, one layer, one actor.

## 1. Change

Type: `Accounting.totalSales: SaleCount` becomes `totalListedValue: TotalListedValue` + `salesCount: SaleCount`
(`TotalListedValue` is already imported in `web/src/lib/types.ts`).

| File | Change |
|---|---|
| `web/src/lib/types.ts:173` | replace field with the two new ones |
| `web/src/lib/sale-math.ts:112` | `cancelledFrom` count uses `salesCount` (unrealized minus gifted) |
| `web/src/lib/ui/AccountingCard.svelte:86,105` | `money(data.totalListedValue)` (value use, was correct in intent) |
| `web/src/routes/(app)/dashboard/+page.svelte:64-65` | `giftedCount` / `pendingCount` read `salesCount` (tiles already say "sale(s)") |
| `web/src/routes/(app)/accounting/+page.svelte:109` | pending line reads `salesCount`, wording "sale(s)" with 1/N pluralisation |
| `web/src/routes/+page.server.ts:112-114` | delete stale "misnamed" comment (code already uses `totalNbTickets`) |
| `web/src/lib/sale-math.spec.ts` | fixture helper takes `salesCount`; `cancelledFrom` cases unchanged in values |
| `docs/tech-debt.md` | delete the whole `totalSales` entry (PSG-109 is the last consumer) |

No other consumer exists: grep of `web/`, `e2e/` finds no further `totalSales`; e2e `accounting.e2e-spec.ts`
asserts none of these fields; `accounting-view.spec.ts` / `accounting-scope.spec.ts` / `season.spec.ts` do not use it.

## 2. Decisions

- Accounting page pending line: today "N tickets" over a value that was never a ticket count. Chosen `salesCount` with
  "sale(s)", matching the Dashboard pending tile wording and the PSG-108 recommendation. Alternative
  `totalNbTickets` keeps "tickets" and is also correct; see open question Q1.
- Cancelled count is derived (`unrealized.salesCount - gifted.salesCount`), same shape as before. A null bucket still
  counts as 0.
- No defensive fallback to `totalSales`: no alias by PSG-108 decision, and the cache was versioned to v2 so no stale
  shape reaches web.
- Tests: red first. Update `accounting()` helper to `salesCount`; existing `cancelledFrom` assertions then fail until
  `sale-math.ts` changes. Svelte templates have no unit tests in this repo; verified by `svelte-check` types
  (a missed `totalSales` read fails to compile once the type changes).

## 3. Open questions

- Q1: Accounting pending line wording, "sales" (default) vs "tickets" via `totalNbTickets`.
- Q2: `AccountingCard` detail row label "Total sales" shows money; relabel to "Listed value"? Default: leave the
  label, out of scope (copy change).
- Q3: deploy order. PSG-108 must not sit in prod without this; merge and deploy PSG-109 right after (known from PSG-108).

## 4. Size

About 20 production lines, 5 test lines, 11 doc lines removed: roughly 35 lines changed, one PR, no split.
