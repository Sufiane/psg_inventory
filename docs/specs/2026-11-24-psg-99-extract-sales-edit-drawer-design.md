# PSG-99 Extract the edit drawer from sales/+page.svelte (design)

Date: 2026-11-24. Frontend only. Behaviour-preserving refactor. Closes follow-up F5 of
`docs/plans/2026-11-19-stitch-redesign-plan.md` (deferred again in PSG-82 and PSG-92).

## Problem

`web/src/routes/(app)/sales/+page.svelte` is 1 215 lines. The `editPanel` snippet (lines
484-778) and the script that only it uses (about lines 128-216 and 368-450) are about 380
lines. They form one form: status draft, per-pass steppers, price and invest inputs,
recipient, `SaleProfitBlock`, delete/cancel/save footer. The new-sale panel and the list
rendering share the file and make it hard to read.

## Goals

- Move the edit drawer into `web/src/lib/ui/SaleEditPanel.svelte` with an explicit props
  interface.
- Move the pure decision logic (status transitions, pass cost hint, confirm copy) into
  `web/src/lib/sale-edit.ts` with node-environment vitest specs. The web vitest config is
  `environment: 'node'`, `include: src/**/*.spec.ts`, so components cannot be unit tested;
  pure helpers can.
- Zero behaviour, markup, class or copy change. Existing e2e selectors keep working.

## Non-goals

- New-sale panel extraction (separate ticket; same pattern, listed as follow-up).
- PSG-90 Log sale form. The drawer's profit block stays `SaleProfitBlock` as is.
- Any backend, API, DTO or schema change.
- Visual or copy changes, fixing PSG-87.

## Stack facts

Svelte 5.56.0, SvelteKit 2.61.1, runes already in use everywhere (`$props`, `$state`,
`$derived`, `$derived.by`, `$effect`, `$props.id()`, snippets, `bind:group`). No legacy
syntax and no `createEventDispatcher`. The new component uses runes and callback props only.

## Design

### Component: `SaleEditPanel.svelte`

Props:

| Prop | Type | Notes |
|---|---|---|
| `sale` | `SaleDetail` | Non-null. Page renders the component only inside `{#if editSale && editSale.id === saleId}`. |
| `layout` | `'card' \| 'row'` | Keeps per-layout element ids (`edit-listed-price-{layout}`, etc., PSG-101). |
| `passes` | `SeasonPass[]` | All passes from page data. Component calls `passesForSale(passes, sale)` itself. |
| `homeFixtures` | `number \| null` | `data.editHomeFixtures`, for the pass cost hint. |
| `commissionPercent` | `number \| null` | `data.commissionPercent`; block hidden when null (unchanged). |
| `errorMessage` | `string \| undefined` | `form?.message`. |
| `closeHref` | `string` | `urlWithEdit(null)`, used by the X link and Cancel. |
| `submitting` | `'update' \| 'delete' \| 'create' \| null` | Read only. Drives disabled state and spinners. |
| `enhanceSubmit` | `SubmitFunction` (from `@sveltejs/kit`) | The page's `trackSubmit`, passed to `use:enhance`. |

No events, no `$bindable`. State flows down; the only upward channel is the form
submission through `enhanceSubmit`.

### State ownership

Stays in the page:

- `submitting` and `trackSubmit` / `trackCreate`. One mutual-exclusion flag is shared with
  the create panel and the Escape handler (`onWindowKeydown`). Making it `$bindable` would
  spread that coupling; passing it down read-only plus the handler keeps one owner.
- `editId`, `editSale`, `urlWithEdit`, the Escape handler, and the focus `$effect` that
  queries `[data-edit-first]` (it queries the document, so it works unchanged against the
  extracted markup).
- The `<datalist id="recipient-options">` (page line 1064). The component's recipient input
  keeps `list="recipient-options"`; the list is page-level and shared. Documented in a
  one-line comment in the component because the dependency is invisible from there.

Moves into the component:

- Draft state: `draftStatus`, `draftListedPrice`, `draftInvest` as `$derived` seeded from
  `sale` (Svelte 5.25+ overridable deriveds; they reset when the `sale` prop changes,
  matching today).
- Derived: `statusChanged`, `editMatchDate`, `isPastMatch`, `visiblePasses`, `passCostHint`.
- `STATUS_OPTIONS`, `stepAllocation`, the `allocStepper` snippet (used only by the drawer),
  and the `onclick` confirm wiring.

### Helper module: `web/src/lib/sale-edit.ts`

Pure, no Svelte imports:

- `isStatusAllowed(current: SaleStatus, target: SaleStatus, isPastMatch: boolean): boolean`
  exact copy of the transition table.
- `passCostBasisHint(passes: SeasonPass[], allocations: SaleAllocation[] | undefined,
  homeFixtures: number | null): string | null`.
- `saveConfirmMessage(input): string | null` and `deleteConfirmMessage(input): string | null`
  returning the exact existing `confirm()` strings, or `null` when no dialog is shown. The
  component does `const message = saveConfirmMessage(...); if (message !== null &&
  !confirm(message)) event.preventDefault();`.

Preserved quirks (must not be "fixed" here): the mark-sold confirm only fires for a past
match; the revert-to-pending confirm fires always; delete of a past match uses the
"rewrites historical numbers" copy, otherwise `Delete the {opponent} sale?`.

### Page after extraction

`editPanel` snippet becomes:

```svelte
{#snippet editPanel(saleId: string, layout: 'card' | 'row')}
    {#if editSale && editSale.id === saleId}
        <SaleEditPanel sale={editSale} {layout} passes={data.passes}
            homeFixtures={data.editHomeFixtures} commissionPercent={data.commissionPercent}
            errorMessage={form?.message} closeHref={urlWithEdit(null)} {submitting}
            enhanceSubmit={trackSubmit} />
    {/if}
{/snippet}
```

Expected page size after: about 840 lines.

## e2e selector contract (must remain true)

From `e2e/tests/sale.e2e-spec.ts`: region named `Edit sale vs {opponent}`; region
`Profit calculation` (from `SaleProfitBlock`) with `data-testid="profit-net"`; radio names
`Sold` / `Gifted` (label text, `statusChoice` input); `Recipient` label (`edit-recipient-*`
id + label `for`); buttons `Save changes` and `Delete sale`; `Edit` link on rows. Markup is
moved verbatim so these hold. The extraction does not touch them.

## Accepted difference

Today both layout instances (card, row) of a sale share one draft because the draft lives in
the page. After extraction each instance owns its draft. Only one layout is visible at a
time (CSS breakpoint), so the only effect is: resizing across the breakpoint mid-edit
drops unsaved draft edits in the newly shown layout. This is an edge case and arguably more
correct. Flagged as an open question; if unwanted, hoist drafts into a `$state` object owned
by the page and pass it `bind:`.

## Risks

- Overridable `$derived` reset semantics: verified by moving, not rewriting, the same
  expressions; e2e covers status save and gift flows.
- `use:enhance={enhanceSubmit}` typing: `trackSubmit` currently has an inferred return
  type; annotate it as `SubmitFunction` in the page.
- Missed `datalist` dependency: the gift e2e (`fill` on Recipient) does not need the list,
  so a regression would not fail e2e. Covered by a manual check in the plan.

## Testing

- vitest: `sale-edit.spec.ts` (nested `describe` per condition, per repo style).
- Existing vitest suites unchanged.
- `npm run check` (svelte-check) and `npm run build` in `web/`, assert build output exists.
- e2e: `sale.e2e-spec.ts` unchanged and run by `qa-verifier`.
- Manual: open drawer, change status, observe hint copy and profit block, gift flow shows
  recipient suggestions, past match confirms.

## Size

Added about 520 lines (component 340, helper 70, spec 110), removed about 380 from the page.
Single PR, under the 800 line cap. One layer, one actor, so no ticket split.

## Follow-ups (separate tickets, not folded in)

1. Extract the new-sale panel the same way (`SaleCreatePanel.svelte`); PSG-90 interacts.
2. If drafts must survive a layout switch, lift them to the page.
