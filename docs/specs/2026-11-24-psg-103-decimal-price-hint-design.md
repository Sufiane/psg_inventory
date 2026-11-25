# PSG-103: inline hint when a decimal price is typed in sale forms

Status: proposed. Size: S (~100 lines). Origin: follow-up to PSG-98
(`docs/specs/2026-11-22-psg-98-whole-euro-sale-prices-design.md`).

## 1. Problem

PSG-98 made prices whole euros. In the sales edit drawer, typing `33.5` in Listed price or
Ticket invest makes `parseAmount` return `null`, so `SaleProfitBlock` shows dashes with no
explanation. User cannot tell what is wrong until submit.

## 2. Findings

| Place | Uses `parseAmount` / live preview | Today on `33.5` |
|---|---|---|
| `web/src/lib/ui/SaleEditPanel.svelte` (edit drawer, used by `sales/+page.svelte`) | yes, feeds `SaleProfitBlock` | dashes, no explanation (the bug) |
| `sales/+page.svelte` new-sale panel | no | native `step="1"` validity bubble on submit, then `validateWholeEuro` server error |
| `sales/new/+page.svelte` | no | same |
| `sales/[saleId]/+page.svelte` | no | same |

`parseAmount` has exactly one consumer (`SaleEditPanel`, two calls). The three create forms have
no live preview, so nothing goes silently wrong there: the browser blocks submit with its own
message and `validateWholeEuro` (PSG-98) is the second line of defence.

## 3. Decisions

1. **Scope: edit drawer only.** Only place with a silent failure. Adding hints to the three
   create forms duplicates state tracking (they use uncontrolled inputs) for no silent-failure
   fix. If wanted, file as a follow-up ticket.
2. **Fields: both** `listedPrice` and `invest`, one hint element each, directly under the input.
3. **Trigger:** raw string trimmed is non-empty, `Number(raw)` is finite, and not an integer.
   Not triggered for empty, for unparsable text (a `type=number` input reports `''` for those,
   so it is already the empty case), or for integer-valued input such as `33.0` or `1e2`.
   Negative or zero values are out of scope (min is enforced by `min` + server).
4. **Logic lives in a pure helper** `wholeEuroHint(raw: string): string | null` in
   `web/src/lib/whole-euro.ts`, next to `validateWholeEuro`. It uses the same integrality
   notion as `parseAmount`, so hint shows exactly when `parseAmount` returns null for a finite
   non-empty value. Unit-tested without a component harness (repo has no Svelte component tests).
5. **Copy:** `Whole euros only.` Short, matches the `€` suffix. No i18n: the web app has no i18n
   layer, all strings are inline English (verify: no `$_(`/i18n imports in `web/src`).
6. **Accessibility:** hint is `<p id="edit-listed-price-hint-{layout}">` / `edit-invest-whole-hint-{layout}`,
   linked via `aria-describedby` (invest input already has `aria-describedby` for the pass-cost
   hint, so both ids are space-joined). Tone `text-xs text-negative`, same footprint as the
   existing pass-cost hint so layout shift is one line. Not `role="alert"` (would announce per
   keystroke).
7. **Submit is not blocked by the hint.** Native `step="1"` and `validateWholeEuro` already
   block; hint is explanatory only.

## 4. Optional backend part: include, as an independent slice

`AddSaleDto` (and `UpdateSaleDto` via `PartialType`) use bare `@IsInt()`; direct API callers get
class-validator's default `listedPrice must be an integer number`. Add
`@IsInt({ message: 'listed_price_must_be_integer' })` and `invest_must_be_integer` (snake_case
code per repo convention).

Interaction with web: `web/src/lib/api.ts` `extractMessage` joins the Nest `message` array into
the thrown error text, and `sales/+page.server.ts` `update` surfaces `err.message` in the
drawer. Web pre-validates with `validateWholeEuro`, so the backend message is reachable only on
a web/backend drift or race; if it did surface, the user would see the raw code, no worse than
today's raw class-validator sentence. No web change needed. Cost: ~15 lines, no risk. The
`@Min` messages stay default (out of scope; one convention gap noted, not widened).

## 5. Non-goals

Hints on the three create forms; hints for `< min` values; i18n; changing `parseAmount` or
`computeDraftBreakdown`; schema changes.

## 6. Size and split

~100 lines total, one PR under the 800 cap, one actor (staff), no schema. Backend (~15) and web
(~85) are independent and touch disjoint files.
