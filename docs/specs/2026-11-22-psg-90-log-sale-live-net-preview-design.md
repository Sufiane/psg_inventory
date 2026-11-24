# PSG-90 Log sale: live net preview and status-aware form: design

Status: draft for review. Branch `psg-90`. Plan:
`docs/plans/2026-11-22-psg-90-log-sale-live-net-preview-plan.md`.
Builds on PSG-92 (edit drawer profit block, commit 2b593eb) and PSG-86 (shared figures).
Layer: web only, one actor (athlete). Depends on PSG-104 (backend: atomic `POST /sales` with
`status`, `recipientName` and optional `listedPrice` for gifts); this ticket is blocked by it.

Caveat on inputs: the Stitch tools were not available to the planning agent, so the Stitch
"Log sale" screen (which may not exist) was not read. Visual layout follows the shipped edit
drawer (decisions section 8 of the PSG-92 spec, screenshot `.context/stitch-edit-drawer.png`
if present). The builder or coordinator should eyeball the result against Stitch if the screen
exists.

## 1. Goal

On `/sales/new`, show the result before saving. A live "Net on this sale" card updates as the
user types price and invest, and the form adapts to the chosen status (Pending, Sold, Gifted).
Invest is prefilled from the season pass cost per home match, with a hint.

## 2. Findings from the code

- The commission endpoint and the shared pieces already shipped in PSG-92:
  `GET /sales/commission` returns `{ commissionPercent }`; `computeSaleBreakdown`,
  `computeDraftBreakdown`, `parseAmount` in `web/src/lib/sale-math.ts`;
  `web/src/lib/ui/SaleProfitBlock.svelte` (props `listedPrice`, `invest`, `commissionPercent`,
  optional `heading`; em dashes when the price is invalid). The ticket's open question (API
  exposes the rate vs frontend duplicates it) is therefore already answered: the API exposes
  it, and PSG-90 only consumes it. The create contract comes from PSG-104, not from this ticket.
- Two new-sale surfaces exist: the route `/sales/new` (linked from the dashboard, the match
  inspector, recent sales; used by `e2e/tests/sale.e2e-spec.ts`) and an inline panel on
  `/sales?new=1` (snippet `newSalePanel` in `sales/+page.svelte`, 1 211 lines). The ticket
  names the route; this spec changes the route only.
- `POST /sales` (after PSG-104, `CreateSaleDto`) accepts `matchId`, `allocations`, optional
  `invest`, optional `status` in `PENDING | SOLD | GIFTED` (default PENDING), `recipientName`
  (required when GIFTED, refused otherwise) and `listedPrice` (>= 1; required for PENDING and
  SOLD, optional for GIFTED, where an absent price stores 0 and 0 profit). It creates the sale
  in its final status in one transaction and returns `{ id }`.
- `POST /sales/update` accepts `status` in `PENDING | SOLD | GIFTED` and `recipientName`.
  CANCELLED is not a settable target; it is derived by the backend. `soldAt` is set by the
  backend on entry into SOLD and is not in the DTO.
- Stored `profit = listedPrice * 0.88`, independent of ticket count (PSG-92 decision). The row
  net is `profit - invest`.
- Edit drawer pass cost hint: `Pass cost basis: <total> / <home fixtures> home matches`, using
  `homeMatchCount` and `passCostPerMatch` from `web/src/lib/accounting-view.ts`.
- `invest` and `listedPrice` are Int columns while the inputs allow cents (pre-existing, Q6 of
  the PSG-92 spec). Not touched here, but the prefill is rounded so it is storable.

## 3. Conflicts between the ticket text and prior decisions (resolved)

| Ticket says | Prior decision | Resolution |
|---|---|---|
| "listed price x tickets" line | PSG-92: stored profit ignores ticket count; adding the line breaks net === row net | No x tickets. Reuse `SaleProfitBlock` unchanged. The ticket's own rule "same figures as the row net" wins. |
| "Sold: sold date field shown" | PSG-92: sold date is read-only, DTO has no `soldAt` | Show the same read-only field with "Set when you save". |
| Cancelled status behaviour | Backend cannot create or set CANCELLED | Cancelled is not offered in the create form. The plum copy lives in the shared note helper (section 4.3) for the drawer to adopt later. |

## 4. Design

### 4.1 Status control and form state

`/sales/new/+page.svelte` becomes state-driven: `matchId`, per-pass ticket counts, `status`
(`PENDING | SOLD | GIFTED`, default PENDING), `listedPrice`, `invest` (strings, parsed with
`parseAmount`), `recipientName`. Ticket count inputs become controlled so the invest prefill
can react. The same segmented control markup and tone classes as the edit drawer's
`STATUS_OPTIONS`, minus Cancelled (see section 3). Keep labels `Listed price (€)` and button
text `Create sale`, because the e2e helper locates them by those names.

Per status:

| Status | Fields shown | Preview card |
|---|---|---|
| Pending | listed price, invest | profit block plus amber "Not yet realized" |
| Sold | listed price, invest, read-only sold date ("Set when you save") | profit block, tone from net sign |
| Gifted | recipient (required, datalist of existing recipients); listed price and invest hidden | teal card "Gifted to <name>, no cash" |

Gifted with an empty name shows "Gifted to ..." with a neutral placeholder, never the string
"undefined". Hidden fields are not removed from component state, so switching status back does
not lose what the user typed.

### 4.2 Live preview

`SaleOutcomeCard.svelte` (new, `web/src/lib/ui/`) takes `status`, `listedPrice`, `invest`,
`commissionPercent`, `recipientName`. For Pending and Sold it mounts the existing
`SaleProfitBlock` unchanged, and for Pending adds an amber "Not yet realized" note. For Gifted
it renders a teal card with no math. All math stays in `sale-math.ts`; the component and page
contain none. If `commissionPercent` is null (fetch failed) the card is not rendered and the
form still works, same as the drawer.

### 4.3 Status copy helper

`web/src/lib/sale-outcome.ts`: `saleOutcomeNote(status, recipientName)` returns
`{ tone: 'warning' | 'sunk' | 'gift'; label: string } | null` (PENDING "Not yet realized",
CANCELLED "Sunk, no proceeds", GIFTED "Gifted to <name>, no cash", SOLD null). It is a pure
function so the copy is unit-tested and shared. CANCELLED has no caller on this page (section
3); it is kept because the ticket specifies the copy and the drawer follow-up needs it. Tone
class strings live in the component, not the helper.

### 4.4 Invest prefill and hint

`suggestedInvest({ passes, ticketsByPassId, homeFixtures })` in `web/src/lib/sale-invest.ts`:
sum over the match season's passes of `passCostPerMatch(pass.price, homeFixtures) *
tickets(pass)`, rounded to a whole euro. It returns `null` when `homeFixtures` is 0 or no
tickets are chosen. Reuses `passCostPerMatch`; no new division logic.

Rationale for ticket weighting (judgment): the ticket says "invest per ticket", and invest is a
whole-sale figure, while price is not multiplied. A pass is one seat, so one allocated ticket
costs one pass share per match.

Behaviour: the invest field follows the suggestion until the user types in it (a `touched`
flag), then the user's value wins. The hint under the field reads
`Pass cost per home match: <money> x <tickets> ticket(s)`, hidden when there is no suggestion.
Home fixtures: computed in the load from the already-fetched `/matches/current-season`
(`homeMatchCount`), so no extra request. New sales only target the current season (page
comment), which makes that list sufficient.

### 4.5 Submitting a status other than Pending (one call)

The `default` action posts one `POST /sales` with the flat payload from `readCreatePayload`
(`matchId`, `allocations`, `status`, `invest?`, and either `listedPrice` for Pending and Sold
or `recipientName` for Gifted). The backend creates the sale in its final status atomically
(PSG-104), so there is no second call, no partially created Pending sale, and no partial-failure
UI. A backend error (for example `sale_after_kickoff`) is shown through the existing message
path and the form keeps its values; nothing was created.

Gifted price: the form hides the price field for Gifted and the payload omits `listedPrice`.
The backend stores 0 for it. No placeholder, no stored profit on gifts. Invest for Gifted is
still submitted (the prefilled or typed value, hidden from view) because the ticket cost is
real.

### 4.6 Files

Web only: `web/src/lib/sale-outcome.ts` (+spec), `web/src/lib/sale-invest.ts` (+spec),
`web/src/lib/ui/SaleOutcomeCard.svelte`, `web/src/routes/(app)/sales/new/+page.server.ts`,
`.../new/read-payload.ts` (+spec, same pattern as `[saleId]/read-payload.ts`),
`.../new/+page.svelte`, `e2e/tests/sale.e2e-spec.ts`, `docs/tech-debt.md`.
Sequencing: merge after PSG-104 slice B (atomic create).

## 5. Out of scope

- The inline new-sale panel in `/sales?new=1`. It will keep the old behaviour. Duplicate
  surface is logged in `docs/tech-debt.md`; remove it or replace it with this form in a
  follow-up.
- Plum Cancelled note in the edit drawer.
- Backend atomic create and optional gift price: delivered by PSG-104, consumed here.
- Int vs decimal inputs (PSG-92 Q6).
- Any change to `SaleProfitBlock`, `sale-math.ts`, backend (PSG-104 owns it), schema.

## 6. Testing

- Unit (vitest): `saleOutcomeNote` per status; `suggestedInvest` (no fixtures, no tickets,
  multi-pass weighted, rounding); `readCreatePayload` (Pending, Sold, Gifted needs recipient,
  Gifted omits `listedPrice`, invalid price, negative invest, no allocations).
  Nested `describe` per condition, short `it` titles.
- Net match guarantee is already covered by PSG-92 specs on `computeSaleBreakdown`; not
  duplicated.
- e2e: in the existing `sale.e2e-spec.ts` (already in `testMatch`): type a price, assert
  `data-testid="profit-net"` shows the expected net; switch to Gifted, assert price field gone
  and recipient required; create a Sold sale and see SOLD in the ledger. Update `createSale`
  only if a label changed (none should).
- Gates: `npm run check`, lint and vitest in `web`.

## 7. Open questions resolved on judgment

1. Rate source: API (already shipped). No duplication.
2. x tickets line: dropped, per PSG-92 and the row-net guarantee.
3. Sold date: read-only "Set when you save".
4. Cancelled: not creatable; copy kept in helper only.
5. Non-Pending create: one call; the atomic backend create is PSG-104.
6. Gifted price: omitted from the payload (backend stores 0); invest still sent.
7. Invest prefill: ticket-weighted, whole euro, stops following once edited.
8. Scope: `/sales/new` route only; inline panel logged as debt.
9. Preview card hidden when the commission fetch fails (same as the drawer).
