# PSG-99 Extract sales edit drawer Implementation Plan

Spec: `docs/specs/2026-11-24-psg-99-extract-sales-edit-drawer-design.md` (approved, option A:
each layout instance owns its draft).

Goal: move the edit drawer out of `web/src/routes/(app)/sales/+page.svelte` into
`web/src/lib/ui/SaleEditPanel.svelte`, with pure logic in `web/src/lib/sale-edit.ts`.
Behaviour, markup, classes and copy unchanged.

Stack: Svelte 5.56.0 runes, SvelteKit 2.61.1, vitest 5 (node env, `src/**/*.spec.ts`).

## Size and split

Single PR, frontend only, one actor (staff), one layer (web). Estimate: about 520 added lines
(component 340, helper 70, spec 110), about 380 removed from the page. Under the 800 cap, no
ticket split. Tasks are sequential (each depends on the previous); no backend work.

## Conventions for the builder

- Conventional commits, lowercase imperative, scope `web`, ticket in parens, e.g.
  `refactor(web): extract sales edit drawer (PSG-99)`. End with the Co-Authored-By line from
  the session attribution. No PR numbers in titles or bodies.
- Branch name `psg-99` (lowercase key, zero padded). Check and rename before first push.
  Move PSG-99 to In Progress first; In Review only when staged for `/crit`.
- Stage, do not commit the final result before the user reviews with `/crit`. Per-task commits
  are fine locally only if the user has not asked otherwise; default is stage and stop.
- Repo style: explicit return types, no single-letter names, braces on every `if`, blank line
  before `if/for/return/throw`, `private readonly` where applicable, numeric separators on 5+
  digit literals, no barrel files, comments only for a non-obvious why, nested `describe` per
  condition in tests.
- Move code verbatim. Do not rename classes, ids, aria labels or copy.

## Task 1: Helper module with TDD (`web/src/lib/sale-edit.ts`, `sale-edit.spec.ts`)

Files: create `web/src/lib/sale-edit.ts`, `web/src/lib/sale-edit.spec.ts`. About 180 lines.

Source of truth for logic to copy: page lines 137-216 (status table, hint) and 368-450
(confirms). Read them again before writing; copy strings exactly.

Exports:

- `isStatusAllowed(current: SaleStatus, target: SaleStatus, isPastMatch: boolean): boolean`
  - target equals current: true. SOLD: current is not GIFTED. PENDING: current is SOLD.
    GIFTED: current is PENDING and not past match. Anything else (CANCELLED): false.
- `passCostBasisHint(passes: SeasonPass[], allocations: SaleAllocation[] | undefined,
  homeFixtures: number | null): string | null`
  - null when fixtures is null or 0 or passes is empty. Counted passes are those with an
    allocation of `nbTickets > 0`, else all passes. Returns
    `Pass cost basis: ${money(total)} ÷ ${fixtures} home matches`.
- `saveConfirmMessage(input: { current: SaleStatus; draft: SaleStatus; opponent: string;
  isPastMatch: boolean; matchDate: Date | null; net: number }): string | null`
  - statusChanged and draft SOLD: only when past match, copy
    `Mark the {opponent} sale as sold? Match was on {dateTime}; this writes a historical sale.`
    else null (no fallthrough to the generic past-match copy; preserve this).
  - statusChanged, draft PENDING, current SOLD: always,
    `Revert the {opponent} sale to pending? This removes {signedMoney(net)} from realized net profit.`
  - otherwise past match: `Save changes to the {opponent} sale? The match was on {dateTime};
    this rewrites historical numbers.`; else null.
- `deleteConfirmMessage(input: { opponent: string; isPastMatch: boolean; matchDate: Date | null }):
  string | null`
  - past match with date: `Delete the {opponent} sale? The match was on {dateTime}; this
    rewrites historical numbers.`; not past: `Delete the {opponent} sale?`. Never null in
    practice; return type stays `string | null` only if past match lacks a date, mirroring the
    old early return. Builder: confirm against old `confirmIfPast` guard and keep identical.

Steps:

1. Write `sale-edit.spec.ts` first. Nested describes by condition:
   - `isStatusAllowed`: when target equals current; when current is GIFTED (SOLD blocked,
     PENDING blocked); when current is SOLD (PENDING allowed, GIFTED blocked); when current is
     PENDING and match is future (GIFTED allowed) / past (GIFTED blocked); when target is
     CANCELLED and current differs.
   - `passCostBasisHint`: when fixtures is null or 0; when no passes; when allocations name
     passes (only those counted); when no allocation has tickets (all passes counted).
   - `saveConfirmMessage`: when draft equals current and future match (null); same status,
     past match (rewrite copy); SOLD from PENDING, future (null) and past (historical copy);
     PENDING from SOLD (revert copy including signed net, regardless of past).
   - `deleteConfirmMessage`: future vs past.
   Use fixed dates, no real clock.
2. Run `cd web && npx vitest run src/lib/sale-edit.spec.ts`; expect failures (module missing).
3. Implement `sale-edit.ts` to pass. Import `money`, `signedMoney`, `dateTime` from
   `$lib/format` (check how sibling specs resolve the alias; match it).
4. Run the spec; expect pass. Run `npx vitest run` for the whole web suite.
5. Stage. Commit message if committing: `refactor(web): add pure sale edit helpers (PSG-99)`.

## Task 2: Component (`web/src/lib/ui/SaleEditPanel.svelte`)

Files: create `web/src/lib/ui/SaleEditPanel.svelte`. About 340 lines.

Props via `$props()` exactly as in the spec table: `sale: SaleDetail`, `layout`, `passes`,
`homeFixtures`, `commissionPercent`, `errorMessage`, `closeHref`, `submitting`,
`enhanceSubmit: SubmitFunction` (type import from `@sveltejs/kit`).

Steps:

1. Copy the `allocStepper` snippet (page 453-482) and the `editPanel` inner content (page
   485-777, without the `{#if editSale && ...}` wrapper) into the component. Replace
   `editSale` with `sale`, `data.commissionPercent` with `commissionPercent`, `form?.message`
   with `errorMessage`, `urlWithEdit(null)` with `closeHref`, `use:enhance={trackSubmit}`
   with `use:enhance={enhanceSubmit}` (import `enhance` from `$app/forms`).
2. Script: `STATUS_OPTIONS` (page 137-158), then
   - `let draftStatus = $derived<SaleStatus>(sale.status);`
   - `let draftListedPrice = $derived(String(sale.listedPrice));`
   - `let draftInvest = $derived(String(sale.invest));`
   - `statusChanged`, `matchDate = $derived(new Date(sale.Match.date))`,
     `isPastMatch = $derived(matchDate.getTime() < Date.now())`,
     `visiblePasses = $derived(passesForSale(passes, sale))`,
     `passCostHint = $derived(passCostBasisHint(visiblePasses, sale.Allocations, homeFixtures))`.
   - `stepAllocation` moved verbatim.
   - Confirm handlers: `confirmSave` and `confirmDelete` call the helper and
     `if (message !== null && !confirm(message)) { event.preventDefault(); }`.
   - Template uses `isStatusAllowed(sale.status, option.value, isPastMatch)`.
   - Draft deriveds are overridden by `bind:group` and `oninput`; this is the same pattern
     the page uses now (overridable deriveds, Svelte 5.25+).
3. Keep `list="recipient-options"` and add one comment above that input:
   the datalist lives in the page.
4. Keep `data-edit-first` attributes untouched (the page effect still targets them).
5. Do not import page-only things (`page`, `goto`, `tick`).
6. Run `cd web && npx svelte-check --threshold error` (or the repo's `npm run check`).
   Component is not yet used; expect no errors in it.
7. Stage. Message: `refactor(web): add sale edit panel component (PSG-99)`.

## Task 3: Wire the page

Files: modify `web/src/routes/(app)/sales/+page.svelte` (net about minus 360 lines).

Steps:

1. Import `SaleEditPanel from '$lib/ui/SaleEditPanel.svelte'` and
   `import type { SubmitFunction } from '@sveltejs/kit'`.
2. Replace the `editPanel` snippet body with the `{#if}` + `<SaleEditPanel .../>` shown in the
   spec. Pass `passes={data.passes}`, `homeFixtures={data.editHomeFixtures}`.
3. Annotate `trackSubmit` as `SubmitFunction` (and keep behaviour; `trackCreate` untouched).
4. Delete from the page, only after confirming zero remaining references with grep:
   `allocStepper` snippet, `STATUS_OPTIONS`, `draftStatus`, `draftListedPrice`, `draftInvest`,
   `statusChanged`, `editMatchDate`, `isPastMatch`, `editVisiblePasses`, `passCostHint`,
   `isStatusAllowed`, `stepAllocation`, `confirmIfPast`, `confirmSave`, `confirmDelete`,
   `confirmMarkSold`, `confirmRevert`.
5. Remove imports that become unused (likely `passesForSale`, `parseAmount`, `saleNet`,
   `signedMoney`, `shortDate`, `dateTime` if unused elsewhere, `SaleProfitBlock`, `StatusChip`
   if unused, `SeasonPass`, `SaleStatus`). Let svelte-check and eslint tell you; do not guess.
6. Keep: `editId`, `editSale`, `urlWithEdit`, the Escape handler, the `[data-edit-first]`
   focus `$effect`, `submitting`, the datalist.
7. Confirm `wc -l` of the page is roughly 840.
8. Stage. Message: `refactor(web): use extracted sale edit panel on sales page (PSG-99)`.

## Task 4: Verification

Run from the worktree. Do not claim success without the output.

1. `cd web && npx vitest run` all green.
2. `cd web && npm run check` zero errors and zero new warnings.
3. Lint if configured (`npm run lint`).
4. `cd web && npm run build`, then assert output exists, because exit 0 alone is not
   evidence: `test -d .svelte-kit/output` and the adapter output directory the repo uses
   (read `web/svelte.config.js`; e.g. `.svelte-kit/cloudflare/_worker.js`). Fail loudly if
   missing.
5. e2e: run `e2e/tests/sale.e2e-spec.ts` the way CI does (see e2e README and
   `e2e/playwright.config.ts`). Both tests must pass: status SOLD flow with profit block net
   matching the row net, and gift flow with Recipient fill and delete. No change to the spec
   file is expected; if a selector breaks, the extraction is wrong, not the test.
6. Manual datalist check (e2e does not cover it): `npm run dev` in `web/`, open
   `/sales?edit={id}` for a PENDING sale, choose Gifted, focus Recipient, type one letter,
   confirm the browser shows existing recipient suggestions as before the change. Also check:
   status hint copy changes with the segmented control; profit block updates while typing
   price and invest; past-match sale shows the warning and confirm dialogs; Esc closes;
   X and Cancel links close; save/delete spinners disable the other button.
7. Compare behaviour at both breakpoints (card below `sm`/row above) once each.
8. Final `git status` and `git diff --stat`: confirm only the four files plus spec/plan docs
   changed, and added lines stay under 800.

## Task 5: Hand-off

1. Update `docs/tech-debt.md` only if findings arise; none expected. Remove or mark closed any
   F5 mentions that treat the drawer as pending (grep `F5` in `docs/`); do not rewrite
   history in old plans.
2. File follow-up Linear tickets (assigned to me, team "PSG Inventory"): extract the new-sale
   panel (`SaleCreatePanel.svelte`); optionally lift drafts to the page if layout-switch
   draft loss matters.
3. Stage everything, tell the user it is ready for `/crit`, move PSG-99 to In Review.

## Out of scope

New-sale panel extraction, PSG-90, PSG-87 net display, any copy or style change, backend.
