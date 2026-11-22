# PSG-98: sale forms accept decimal prices but DB columns are Int

Status: proposed. Size: S. Origin: Q6 of the PSG-92 spec (pre-existing).

## 1. Problem

Sale forms (new-sale panel on /sales, /sales/new, /sales/[saleId], the edit drawer) render
`<input type="number" step="0.01">` for `listedPrice` and `invest`. Backend stores both as
Prisma `Int` (`Sales.listedPrice`, `Sales.invest`, `SaleHistories.listedPrice`). The live
profit block (PSG-92) previews whatever was typed, so `33.5` shows a net that was never stored.

Current behaviour with `33.5`:

- `AddSaleDto` uses `@IsNumber() @Min(..)` (no `@IsInt`), so the DTO accepts it.
  `UpdateSaleDto` inherits via `PartialType(AddSaleDto)`.
- Prisma `Int` then rejects the Float at the client, so the API most likely answers 500
  instead of a clean 400. The user never gets a truncated value, they get an error. Verify in
  the plan (task 1 characterisation test).
- Web server actions only check `Number.isFinite` and `>= min`, never integrality.

## 2. Findings: where the two fields are typed, validated, stored, displayed

| Place | Today |
|---|---|
| `src/prisma/schema.prisma` Sales | `listedPrice Int`, `invest Int @default(0)`, `profit Float` |
| `SaleHistories` | `listedPrice Int`, `profit Int` (see 6, latent bug) |
| `SeasonPass.price`, `nbTickets` | `Int` |
| `add-sale.dto.ts` | `@IsNumber()` + `@Min(1)` / `@Min(0)`, no integer check |
| `sales-import/dto/draft-row.dto.ts` | `@IsInt()` already, both fields |
| `sales-import.resolver.ts` `isInvalidRow` | `Number.isInteger` already, both fields |
| `sales-import.csv.ts` | `Number(value)`, resolver rejects fractions as invalid row |
| `computeProfit` (backend) | `price * (100 - 12) / 100`, stored as Float, so stored profit is already fractional (33 -> 29.04) |
| `web/src/lib/sale-math.ts` | `computeSaleBreakdown` uses the identical formula, so proceeds/net previews are bit-identical to stored values for integer inputs |
| Web inputs with `step="0.01"` | `sales/+page.svelte` edit drawer (2) and new-sale panel (2); `sales/new/+page.svelte` (2); `sales/[saleId]/+page.svelte` (2) |
| Web server validation | `sales/+page.server.ts` create, `sales/new/+page.server.ts`, `sales/read-payload.ts`, `sales/[saleId]/read-payload.ts`: `isFinite` + min only |
| `ImportSalesDraft.svelte` inputs | no `step` (default 1), edits go through draft DTO `@IsInt` |
| Display | `money()` uses `Intl.NumberFormat` EUR, handles fractions, no change needed |

Import path is already whole-euro only. That is the strongest consistency argument: two of
three entry paths (CSV, import draft) already reject decimals.

## 3. Options

### A. Whole euros (recommended)

Input `step="1"`, `@IsInt()` on the DTO, integer checks in the web server actions, preview
refuses non-integers. No schema change, no migration, no data change.

Costs: users cannot enter cents. Net and profit still show cents (profit is Float because of
the 12 % commission), so display precision is unchanged.

### B. Decimal / cents columns

Cost list: migration `Int -> Decimal(10,2)` (or Int cents) on `sales.listed_price`,
`sales.invest`, `sale_histories.listed_price`; `SeasonPass.price` for consistency (passes
feed allocation cost into `invest`); brand type changes (`Cents` per global convention) across
shared/money, db types, accounting aggregates (`_sum/_avg/_min/_max` return `Decimal` in
Prisma, not number, so every accounting util and `format-aggregate.util.ts` needs conversion);
JSON contract change (cents vs euros) breaking web `money()`, sorting, summaries, Ask context;
CSV import and draft DTO must accept decimals (comma vs dot locale handling); seeds and e2e;
float drift in `computeProfit` unless profit also moves to cents; rounding policy for 12 %
commission on cents. Realistically L (two or three tickets), high regression surface on
hardened accounting code.

Gain: ability to price at 33.50. Nothing in the product asks for it: PSG-lot resale prices
are whole euros, season passes are whole euros, the CSV format was designed integer.

### Pick: A

B only pays off if fractional ticket prices are a real need. No evidence. If that need
appears, B becomes its own ticket and A's validation is simply relaxed then.

## 4. Design (A)

Backend (one file plus spec):

- `add-sale.dto.ts`: add `@IsInt()` to `listedPrice` and `invest` (keep `@Min`). Inherited by
  `UpdateSaleDto`. Result: 400 with class-validator message instead of 500.
- New DTO validation spec asserting: `33.5` rejected for both fields on Add and Update; `33`
  accepted; `0` invest accepted; `0` listedPrice rejected.

Web:

- `sale-math.ts`: `parseAmount` returns `null` for non-integer input (so `SaleProfitBlock`
  shows dashes rather than a net that cannot be saved). `computeDraftBreakdown` also guards
  `Number.isInteger`.
- New small `isWholeAmount(value: number): boolean` is NOT needed; use `Number.isInteger`
  inline in the four server validators.
- Server validators (`sales/+page.server.ts` create, `sales/new/+page.server.ts`,
  `sales/read-payload.ts`, `sales/[saleId]/read-payload.ts`): reject non-integers with
  `Listed price must be a whole number of euros.` / `Invest must be a whole number of euros.`
- Inputs: `step="0.01"` to `step="1"` in 8 places, add `inputmode="numeric"`.
- Tests: `sale-math.spec.ts` (parseAmount, computeDraftBreakdown fraction case),
  `read-payload.spec.ts` (fraction rejected for both fields).

Out of scope: `SaleHistories.profit` Int vs Float (section 6), commission rounding,
`SeasonPass.price` input (already Int, separate form).

## 5. Size and split

About 170 lines total including tests (backend ~45, web ~125). Under the 800 cap. Two layers
but both are trivially small and the contract (reject non-integers) is identical on each side,
so recommend one PR. If the coordinator wants strict layer separation: slice 1 backend DTO
(~45 lines), slice 2 web (~125 lines), no ordering dependency (web validates independently;
backend is the safety net).

## 6. Adjacent finding (separate ticket, not absorbed)

`SaleHistories.profit` is `Int` while `Sales.profit` is `Float`. `update-sale.usecase.db.ts`
and `ungift-sale.usecase.db.ts` copy `currentSale.profit` into the history row. For any price
whose 88 % is fractional (e.g. 33 -> 29.04) Prisma should reject the Float for an Int column,
so editing or un-gifting such a sale would fail. Not verified against a live DB. Recommend a
new ticket: characterise first, then migrate `sale_histories.profit` to `Float`. Do not
absorb here: it needs a migration, this ticket needs none.

## 7. Open questions

Q1. Confirm whole euros is acceptable product-wise (pick A). Only blocking question.
Q2. One PR or two slices (default: one PR).
Q3. Open the `SaleHistories.profit` ticket now? Recommended yes.
