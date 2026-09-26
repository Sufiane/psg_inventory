# `sale.e2e-spec.ts` — create, SOLD, GIFTED, delete — Design

**Date:** 2026-09-25
**Status:** Draft
**Issue:** PSG-33 (parent PSG-31, blocked-by PSG-32 — merged)
**Type:** E2E test-only. No application code changes.

## Problem

PSG-32 landed the e2e foundation (`e2e/global-setup.ts`, `e2e/fixtures.ts`,
`e2e/paths.ts`, `e2e/playwright.config.ts`, the `authenticated` Playwright project,
`scripts/seed-e2e.ts`, and one example spec, `e2e/tests/auth.e2e-spec.ts`). PSG-33 is the
first spec to actually run under the `authenticated` project: it needs a seeded match and
season pass to sell against, and must exercise sale creation, both terminal status
transitions (SOLD, GIFTED with a recipient), and deletion, through both `/sales/new` and
the `/sales` page's inline edit drawer.

The referenced parent implementation-plan doc
(`docs/plans/2026-09-24-e2e-critical-path-tests-implementation-plan.md`) was never
committed and does not exist in this repo. This spec treats PSG-33's own Linear
description as the source of truth and is derived fresh from reading the current sales
feature and e2e scaffold.

## Non-goals

- No application/frontend/backend code changes. Test-only, plus a seed-script check (see
  D2 — concluded no change is needed).
- No coverage of season-pass creation, CSV import, or the ask feature — separate PSG-31
  sub-tickets.
- No CI wiring to run `e2e/` automatically — `.github/workflows/ci.yml` does not invoke
  `npm run local:db:seed:e2e` or `playwright test` today, and wiring that up is out of
  scope for this ticket.
- No coverage of `CANCELLED` status or the "revert to pending" affordance — not named in
  the ticket.

## Design decisions

### D1 — The ticket's literal chain ("create → SOLD → GIFTED → delete") is not a legal state machine; split into two scenarios

Reading `web/src/routes/(app)/sales/+page.svelte`'s edit-drawer markup (and its own D5
comment) plus `src/api/sales/usecases/update-sale/`: a sale's status graph is

```
PENDING --mark sold--> SOLD --revert--> PENDING
PENDING --mark gifted--> GIFTED  (terminal, never reachable from SOLD)
```

GIFTED is reachable only from PENDING, and once SOLD the only reverse transition is back
to PENDING — never to GIFTED. A single sale genuinely cannot pass through SOLD and then
GIFTED. The ticket's phrasing ("create, mark SOLD, mark GIFTED, delete") is read as an
enumeration of the actions to cover, not a literal transition sequence on one row.

**Resolution:** the spec covers two independent sales in the same file:

- **Scenario A (SOLD path):** create via `/sales/new` → open the row's inline edit drawer
  on `/sales` → mark SOLD → delete.
- **Scenario B (GIFTED path):** create via `/sales/new` → open the row's inline edit
  drawer on `/sales` → mark GIFTED with a recipient name → delete.

Together these cover every action named in the ticket (create, SOLD, GIFTED+recipient,
delete) across both surfaces (`/sales/new`, `/sales` inline drawer).

### D2 — No seed-script changes

`scripts/seed-e2e.ts` already seeds:
- the e2e user (`E2E_USER_EMAIL`),
- one match (`E2E_OPPONENT_NAME`, home, `CHAMPIONSHIP`, kickoff 30 days from run time —
  always in the future, so update-sale's kickoff guard never blocks these tests and no
  `confirm()` dialog fires from the mark-sold button, which only prompts for past
  matches),
- one season pass (`E2E_SEASON_PASS_LABEL`, category A, row 1, seat 1) for the match's
  season.

`SaleAllocationsValidator` (`src/api/sales/shared/sale-allocations.validator.ts`) only
checks that an allocated pass belongs to the user and matches the match's season — it does
not check remaining ticket capacity against other sales. So the single seeded pass
supports both scenarios' sales without needing a second pass or a second match.

Both `seedUser()` and `seedMatch()` already delete prior sales (and their allocations/
gift/history rows) tied to the e2e user and the e2e match respectively, before
re-seeding. So sales created by this spec are cleaned up automatically the next time
`npm run local:db:seed:e2e` runs, even if a prior run left a sale undeleted (e.g. a failed
assertion mid-test). **No seed-script edit is needed for this ticket.**

### D3 — Desktop viewport renders the table (`saleRow`), not the mobile card (`saleCard`)

`+page.svelte` renders two markups for the same data: `saleCard` inside a `sm:hidden`
wrapper (mobile) and `saleRow` inside `hidden sm:block` (desktop, `≥640px`). The
`authenticated` Playwright project uses `devices['Desktop Chrome']` (no viewport
override), which is well above the `sm` breakpoint. The test locates rows and the "Edit"
link inside the `hidden sm:block` table, not the card list — the card list is
`display:none` at this viewport and any locator built against it would silently fail to
find a *visible* element.

### D4 — Locating a just-created sale's row without knowing its id

`/sales/new`'s create action and `/sales`'s own `?/create` action both redirect to
`/sales` (or `/sales?year=...`) with no id in the URL or response body — the created
sale's id is never exposed to the test. Both the seeded opponent name and the seeded
match are shared by every sale created in this spec, so a row can't be identified by
opponent name alone once more than one sale exists for it.

**Resolution:** give each scenario's sale a distinct, scenario-specific `listedPrice`
(e.g. `501` for Scenario A, `502` for Scenario B) chosen once as a constant in the spec
file. Locate the row with a Playwright locator scoped to a `<tr>` containing both the
seeded opponent name and that formatted price (`money()` renders as `€501.00` — match on
the numeric substring to stay resilient to currency/locale formatting specifics). This
also keeps the two scenarios' tests safe to run as separate `test()` blocks under
Playwright's `fullyParallel` config without racing each other over an ambiguous "the only
row for this opponent" locator.

### D5 — Dialog handling

Only the "Delete sale" button's `confirmDelete` handler calls `confirm()` unconditionally
(both past and future matches). `confirmMarkSold` only prompts for a past-kickoff match,
which the seeded match never is, so marking SOLD needs no dialog handling. The "Mark
gifted" button has no confirm handler at all. So the spec needs a `page.on('dialog', ...)`
handler (accepting) registered before each delete click — nothing more.

### D6 — Recipient input is a free-text field, not a picker

The gift form's `recipientName` is a plain `<input>` with a `list="recipient-options"`
datalist for autocomplete suggestions, not a `<select>`. The test fills it with a literal
string (e.g. `'E2E Recipient'`) — no need to interact with the datalist.

## Test file: `e2e/tests/sale.e2e-spec.ts`

Registered project: `authenticated` (already matched by
`playwright.config.ts`'s `testMatch: /(sale|season-pass)\.e2e-spec\.ts/`) — no config
change needed.

Two `test()` blocks under one `describe('sale lifecycle')`:

1. **`create, mark SOLD, then delete a sale (via /sales/new and the inline edit drawer)`**
   - `page.goto('/sales/new')`.
   - Select the seeded match (`E2E_OPPONENT_NAME`) in the Match `<select>`.
   - Fill the seeded pass's ticket-count input with `1`.
   - Fill `listedPrice` with the scenario A constant.
   - Submit ("Create sale"); expect redirect to `/sales`.
   - Locate the new row (D4) in the desktop table; expect its status pill to read
     `PENDING`.
   - Click the row's "Edit" link; expect the inline drawer (`role="region"`,
     `aria-label` containing the opponent name) to become visible.
   - Click "Mark sold"; expect the row's status pill (or the drawer's "Currently" pill)
     to update to `SOLD`.
   - Re-open the drawer if it closed on navigation; register the dialog-accept handler
     (D5); click "Delete sale"; expect the row for that price to no longer exist on
     `/sales`.

2. **`create, mark GIFTED with a recipient, then delete a sale (via /sales/new and the inline edit drawer)`**
   - Same creation flow as above with the scenario B price constant.
   - Open the drawer; fill `recipientName` with a literal test recipient name; click
     "Mark gifted"; expect the status pill to update to `GIFTED` and the drawer to show
     "Given to `<recipient name>`".
   - Register the dialog-accept handler; click "Delete sale"; expect the row to no longer
     exist.

Both tests assert final absence of their row so a failed assertion mid-scenario still
leaves at most one dangling row per price — self-limiting even without D2's automatic
next-reseed cleanup.

## Open questions resolved by this spec (flagged for review)

1. The ticket's literal SOLD→GIFTED chain is impossible; resolved as two scenarios (D1).
2. Confirmed no seed-script change is needed (D2) — the ticket asked this explicitly as
   something to "determine."
3. Chose price-based row disambiguation (D4) over, e.g., adding a `data-testid` to
   `saleRow`/`saleCard` in application code — kept to test-only scope per the ticket's own
   instruction ("no application code changes").
