# PSG-92 Sales edit drawer: profit calculation block: design

Status: draft for review. Branch `psg-92`. Builds on PSG-87 (net profit shown in drawer,
commit e1b141a) and PSG-82 (ledger row net). Must share its calculation with PSG-90 (Log sale
preview). Plan: `docs/plans/2026-11-21-psg-92-sales-edit-drawer-profit-block-plan.md`.

Caveat on inputs: the Linear tools (`mcp__linear__*`) and Stitch tools (`mcp__stitch__*`) were
not available to the planning agent in this run. The ticket text of PSG-92/87/90 and the Stitch
screen "Sales - Edit Sale Drawer" (id db96881ba7474605bc9ba0dc0c66685b) were NOT read. This
spec is derived from the code and from the coordinator brief. Visual details (block position,
exact labels, spacing) are therefore marked "per Stitch" and must be confirmed by the builder
or coordinator against the screen. Do not copy the "Parc des Princes ledger" status note.

## 1. Goal

In the Sales edit drawer, show a profit calculation block that updates live as the user edits
the numbers form: listed price, minus PSG commission, minus ticket invest, equals net profit.
The same pure calculation and the same display component are reused by the PSG-90 Log sale
preview (new-sale panel).

## 2. Findings from the code

- Commission is `PSG_COMMISSION = 12` in `src/shared/constants.ts`, used only by
  `src/api/sales/shared/profit.util.ts`: `computeProfit(price) = (price * (100 - 12)) / 100`.
  The web has no copy of the rate. `scripts/seed-demo.ts` has its own `0.12` (seed only).
- DB: `Sales.listedPrice Int`, `profit Float` (stored unrounded), `invest Int`. Stored `profit`
  is proceeds after commission, before invest. Ledger row net = `saleNet(sale) = profit - invest`
  (`web/src/lib/sale-math.ts`), used by the row, the sort and the drawer header (PSG-87).
- Drawer numbers form inputs (`listedPrice`, `invest`) are uncontrolled (`value={editSale...}`),
  so nothing reacts to typing today. The new-sale panel has the same two inputs.
- `web/src/lib/ui/MathBlock.svelte` already renders signed lines plus one result and is used by
  Dashboard, Accounting and the Matches inspector.
- `@psg/shared` is type-only (`.d.ts`) and aliased by path. A runtime constant there would need
  backend path-alias runtime resolution; rejected (risk, see memory on build output path).
- `sales/+page.svelte` is 1 142 lines. Drawer extraction (F5 of the redesign plan) is a known
  follow-up and is not part of this ticket.

## 3. Decision D1: where the web gets the commission rate

| Option | What | Cost | Verdict |
|---|---|---|---|
| A | Web constant `COMMISSION_PERCENT = 12` in one file | 5 lines, but a second source of truth; drift makes the preview disagree with stored profit | Fallback only |
| B | Backend exposes the rate; web fetches it in the sales load | Small backend slice (endpoint + spec, ~90 lines), one extra fetch | Recommended |
| C | Runtime constant in `@psg/shared` | Touches backend module resolution | Rejected |
| D | `POST /sales/preview` computing server side | Round trip per keystroke, more API surface | Rejected |

Recommendation: B, as its own backend ticket (call it PSG-92a), merged before the web slice.
It is outside the web-only scope of PSG-92 and PSG-90, so it is flagged for the coordinator,
not absorbed. Minimum shape: `GET /sales/commission` returning `{ commissionPercent: Percentage }`
declared before `@Get('/:saleId')` in `SalesController`, delegating to a service method that
returns `PSG_COMMISSION`. No db, no cache, authenticated like the other sales routes.
Honest cost note: the rate has not changed in the app's life, and historical sales keep the rate
they were stored with, so B buys drift protection for new sales only. It is still preferred
because the alternative silently lies when the constant changes.
If the coordinator rejects B: use A in `web/src/lib/commission.ts`, and file a ticket to
replace it.

## 4. Design

Pure util in `web/src/lib/sale-math.ts` (next to `saleNet`):

```
type SaleProfitBreakdown = { listedPrice; commission; proceeds; invest; net }
computeSaleBreakdown({ listedPrice, invest }, commissionPercent): SaleProfitBreakdown
```

- `proceeds = (listedPrice * (100 - commissionPercent)) / 100`: the exact expression and
  operation order of backend `computeProfit`, so the float is bit-identical to the stored
  `profit`. `net = proceeds - invest`, the same subtraction as `saleNet`.
- `commission = listedPrice - proceeds`, display only (never compared).
- Non-finite or empty input is treated as 0 by the caller (`Number('')` guard), the util stays
  pure and total.

Net match guarantee (PSG-87): for a saved sale with stored `profit`, 
`computeSaleBreakdown({sale.listedPrice, sale.invest}, 12).net === saleNet(sale)`.
A spec asserts this on a table of prices including non-clean multiples (33, 499, 1 007).
The block renders `money(net)` through the same `money`/`signedMoney` formatters as the row.

Component `web/src/lib/ui/SaleProfitBlock.svelte`, props
`{ listedPrice: number; invest: number; commissionPercent: number }`. It calls the util and
renders a `MathBlock` (lines: Listed price, minus Commission with the percent in the label,
minus Ticket invest; result "Net profit"; result tone follows sign via `MathBlock`). No
duplicated markup or math in the page. PSG-90 mounts the same component in the new-sale panel
with its own inputs. Layout and copy per Stitch.

Drawer wiring (`sales/+page.svelte`): track current `listedPrice` and `invest` values via an
`oninput` on the numbers `<form>` (inputs stay uncontrolled, so form submission is untouched),
reset to the saved sale values when `editSale.id` changes. Block placed per Stitch, inside the
numbers form region, after the inputs.

Load (`+page.server.ts`): fetch the commission and return `commissionPercent` in page data. The
same value feeds PSG-90.

Visibility (open, section 6 Q3): recommended to show for PENDING and SOLD only; hide for
GIFTED (no price) and CANCELLED (row shows an em dash).

## 5. Out of scope

Drawer extraction into its own component, status-note copy from Stitch, any change to stored
`profit`, ledger rows, footer, or the PSG-90 panel itself (it only consumes the shared pieces).
Backend recomputation of historical sales.

## 6. Open questions (not mechanical)

Q1. Commission source: B (recommended, separate backend ticket) or A (web constant)? Needs
    coordinator decision before the web slice starts.
Q2. Wording. The redesign brief bans "fees" and Q13 of the redesign spec left naming the 12 %
    commission undecided. Recommend "PSG commission (12 %)". Needs product confirmation, or
    follow whatever the Stitch screen says.
Q3. Which statuses show the block (recommended PENDING and SOLD; hide GIFTED and CANCELLED).
Q4. Empty or invalid price while typing: recommend rendering the block with 0 values rather than
    hiding it (no layout jump). Alternative: show em dashes.
Q5. Stitch screen unread in this run: confirm block position, labels, and whether an
    intermediate "Net proceeds" line (after commission, before invest) is wanted. Util already
    returns `proceeds`, so adding the line is free.
Q6. Form inputs accept decimals (step 0.01) while DB columns are Int; pre-existing, not touched,
    but the preview of `33.5` would not match what is stored. Candidate follow-up ticket.

## 7. Testing

- Unit (vitest, web): `computeSaleBreakdown` branches (clean price, non-clean price, zero
  invest, invest above proceeds gives negative net, zero price); equals `saleNet` for stored
  profit computed with the backend formula.
- Backend slice: service spec for the commission getter, controller route ordering covered by
  an e2e GET.
- e2e: extend the existing `e2e/tests/sale.e2e-spec.ts` (already in testMatch): open drawer,
  type a price, assert the block's net equals the row net after save.

## 8. Decisions (2026-11-22, confirmed by user; Stitch screen read)

- Q1: backend endpoint `GET /sales/commission` returning `{ commissionPercent }`, declared before `/:saleId`.
- Q2/Q5: Stitch labels: "Profit calculation" header with "Auto-computed" tag; lines "Listed price × tickets" (`310,00 € × 1 = 310,00 €`), "Minus 12% commission", "= Proceeds", "Minus ticket invest"; result "Net on this sale". Do not copy the footer note "Realized upon payout · Parc des Princes ledger". Screenshot: `.context/stitch-edit-drawer.png`.
- Q3: block shown for SOLD and PENDING only.
- Q4: empty or invalid price renders em dashes (not zeros).
- Proceeds line is included (Stitch shows it).
