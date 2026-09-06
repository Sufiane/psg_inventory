# Sale-Form Pass Filter Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all four sale-form entry points offer only season-correct passes, through one shared helper instead of four hand-written copies, and make the sales screen's "+ New sale" gate a correct, server-computed decision instead of a client-side `===` check on an unsanitized param.

**Architecture:** Extract the season-pass filtering rule into a pure, isomorphic helper `passesForMatch()` in a new `web/src/lib/sale-passes.ts`. Refactor the two already-fixed standalone routes onto it (behaviour-preserving), then wire it into the two previously-unfixed inline panels on the sales list screen. Separately, fix the sales list `load` so it returns the sanitized `seasonYear` (not the raw `year` param) and a server-computed `canCreate` flag, and gates the `/matches/current-season` fetch on it — see Task 4's note for why an earlier draft's season-aware match fetch was reverted.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + Tailwind 4 (`web/`). Backend is NestJS 11 (`src/`) and is **not touched**. Shared branded types come from `@psg/shared/*` (types only, `.d.ts`, no runtime code).

**Spec:** `docs/specs/2026-09-06-sale-form-pass-filter-unification-design.md`

## Global Constraints

- **Frontend-only.** No file under `src/` may be created, modified, or deleted. The backend already enforces this invariant in `SalesService.validateAllocations()` and already exposes `GET /season-passes?season=YYYY` and `GET /matches/season/:seasonStartYear`.
- **`web/` has no test runner.** No vitest, no `test` script, no `web` job in CI. Do **not** add one — it is a tracked separate follow-up. Verification for every task is `npm run check` + `npm run typecheck` inside `web/`, plus the browser steps written into each task.
- **Do not season-scope the pass load on the sales list page.** `web/src/routes/(app)/sales/+page.server.ts:28` must keep calling `/season-passes` with no `season` param. `ImportSalesModal` groups that list into "Current season" and "Previous seasons" and would break. Same for `web/src/routes/(app)/sales/new/+page.server.ts:11`.
- **Code style (enforced by the repo's eslint config and CLAUDE.md):**
  - Explicit return types on every exported function.
  - No single-letter local variable names. `for (const pass of passes)`, `.catch((error) => …)`. Only `i`/`j`/`k` in indexed `for` loops.
  - No inline `if` — always braced, body on its own line.
  - Blank line before `if`, `for`, `while`, `return`, `throw` unless it is the first statement in its block.
  - No `!!x` and no double-bang. Use `x != null` or `=== true`.
  - Comment only where the "why" is genuinely non-obvious. Do not add one comment per constant.
- **Dependency pinning:** exact versions, no `^`/`~`. No new dependencies are needed by this plan.
- **Season semantics:** a season runs Aug 1 → Jul 31 UTC. `seasonStartYear` is the calendar year of the August. The `?year=` search param on `/sales` is a `seasonStartYear`, not a calendar year.
- **Commit style:** conventional commits, scope `sales` or `web`. Stage and commit at the end of each task.

## File Structure

| File | Responsibility |
|---|---|
| `web/src/lib/season.ts` | Pure season primitives, no domain types. Existing `seasonStartYearFromDate`; gains `seasonLabel`. |
| `web/src/lib/sale-passes.ts` | **New.** The single implementation of "which passes may this sale form offer". Imports `SeasonPass` from `$lib/types` and `seasonStartYearFromDate` from `$lib/season`. |
| `web/src/routes/(app)/sales/new/+page.svelte` | Standalone new-sale form. Filters client-side, reactive to the match `<select>`. |
| `web/src/routes/(app)/sales/[saleId]/+page.server.ts` | Standalone edit-sale `load`. Filters server-side; match is fixed. |
| `web/src/routes/(app)/sales/+page.server.ts` | Sales list `load`. Season-aware sales fetch and match fetch; unfiltered pass fetch. |
| `web/src/routes/(app)/sales/+page.svelte` | Sales list, incl. both inline panels. Filters both client-side. |

---

### Task 1: The shared helper

**Files:**
- Create: `web/src/lib/sale-passes.ts`
- Modify: `web/src/lib/season.ts`
- Test: none — `web/` has no test runner (see Global Constraints). Verified by `svelte-check` and by the consumers in Tasks 2-5.

**Interfaces:**
- Consumes: `seasonStartYearFromDate(date: Date): SeasonYear` from `$lib/season`; `SeasonPass` from `$lib/types` (fields used: `id: SeasonPassId`, `seasonStartYear: SeasonYear`); `SeasonPassId` from `@psg/shared/ids`; `SeasonYear` from `@psg/shared/time`.
- Produces:
  - `passesForMatch(passes: SeasonPass[], matchDate: Date | string | null | undefined, keepPassIds?: ReadonlySet<SeasonPassId>): SeasonPass[]` from `$lib/sale-passes`
  - `seasonLabel(year: SeasonYear): string` from `$lib/season`

- [ ] **Step 1: Add `seasonLabel` to `web/src/lib/season.ts`**

Append below the existing `seasonStartYearFromDate`. Leave that function exactly as it is — its UTC handling and its comment were settled by the 2026-09-04 review.

```ts
export function seasonLabel(year: SeasonYear): string {
    return `${year}/${year + 1}`;
}
```

- [ ] **Step 2: Create `web/src/lib/sale-passes.ts`**

```ts
import type { SeasonPassId } from '@psg/shared/ids';
import { seasonStartYearFromDate } from './season';
import type { SeasonPass } from './types';

/**
 * The passes a sale form may offer for a given match.
 *
 * `keepPassIds` is the edit-form escape hatch: a pass already allocated to the
 * sale stays visible even if its season disagrees, because hiding its input
 * would silently zero those tickets on the next save. Create forms omit it.
 *
 * Returns `[]` for a nullish `matchDate` — the "no match picked yet" case.
 * Callers distinguish that from "this season has no passes" by testing the
 * selected match themselves.
 */
export function passesForMatch(
    passes: SeasonPass[],
    matchDate: Date | string | null | undefined,
    keepPassIds?: ReadonlySet<SeasonPassId>,
): SeasonPass[] {
    if (matchDate == null) {
        return [];
    }

    const season = seasonStartYearFromDate(
        matchDate instanceof Date ? matchDate : new Date(matchDate),
    );

    return passes.filter(
        (pass) => pass.seasonStartYear === season || keepPassIds?.has(pass.id) === true,
    );
}
```

Note the deliberate choices: `== null` rather than two comparisons, `=== true` rather than `!!`, `filter` rather than a loop so input order is preserved and a new array is returned.

- [ ] **Step 3: Type-check**

Run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```
Expected: both exit 0. `svelte-check` reports `0 errors`. The new file has no consumers yet, so nothing else should move.

- [ ] **Step 4: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add web/src/lib/sale-passes.ts web/src/lib/season.ts
git commit -m "refactor(sales): extract passesForMatch into a shared helper"
```

---

### Task 2: Refactor the standalone edit page onto the helper

**Files:**
- Modify: `web/src/routes/(app)/sales/[saleId]/+page.server.ts:1-26`

**Interfaces:**
- Consumes: `passesForMatch` from Task 1.
- Produces: nothing new. `load` still returns `{ sale, passes }` with the same contents, so `[saleId]/+page.svelte` is untouched.

This task is strictly behaviour-preserving. It exists so the union rule has exactly one implementation before Task 5 needs a second copy of it.

- [ ] **Step 1: Replace the inline filter in `load`**

Replace lines 1-26 of `web/src/routes/(app)/sales/[saleId]/+page.server.ts` with:

```ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import { parseAllocationsFromForm } from '$lib/sale-allocations';
import { passesForMatch } from '$lib/sale-passes';
import type { SaleDetail, SeasonPass } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const { saleId } = event.params;
    const [sale, passes] = await Promise.all([
        api<SaleDetail>(event, `/sales/${saleId}`),
        api<SeasonPass[]>(event, '/season-passes'),
    ]);

    const allocatedPassIds = new Set(
        (sale.Allocations ?? []).map((allocation) => allocation.seasonPassId),
    );

    return { sale, passes: passesForMatch(passes, sale.Match.date, allocatedPassIds) };
};
```

Everything from `export const actions` (line 28) onward stays exactly as it is.

The `seasonStartYearFromDate` import and the `saleSeason` / `visiblePasses` locals are removed — the helper owns both now.

- [ ] **Step 2: Type-check**

Run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```
Expected: both exit 0. If `svelte-check` reports an unused-import error for `seasonStartYearFromDate`, you left the old import in — delete it.

- [ ] **Step 3: Verify no behaviour change in the browser**

Start the app (`npm run dev` in `web/`, backend running per the repo README), then:

1. Open a sale whose match is in the current season at `/sales/<saleId>`.
2. Confirm "Tickets per pass" lists exactly the same passes it listed before this task — current-season passes only, with the allocated ones pre-filled to their current counts.
3. Confirm the pass rows appear in the same order as before.

- [ ] **Step 4: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add "web/src/routes/(app)/sales/[saleId]/+page.server.ts"
git commit -m "refactor(sales): use passesForMatch on the standalone edit page"
```

---

### Task 3: Refactor the standalone new-sale page onto the helper

**Files:**
- Modify: `web/src/routes/(app)/sales/new/+page.svelte:1-35` and `:82-89`

**Interfaces:**
- Consumes: `passesForMatch` from Task 1, `seasonLabel` from Task 1.
- Produces: nothing new.

Also behaviour-preserving. The `$effect` that re-seeds `selectedMatchId` on same-route navigation stays — it fixes a real bug and is unrelated to this work.

- [ ] **Step 1: Replace the derived block in the `<script>`**

In `web/src/routes/(app)/sales/new/+page.svelte`, change the import on line 5 from:

```ts
    import { seasonStartYearFromDate } from '$lib/season';
```

to:

```ts
    import { passesForMatch } from '$lib/sale-passes';
    import { seasonLabel, seasonStartYearFromDate } from '$lib/season';
```

Keep the existing import ordering convention in that file (`$lib/format`, then the season imports, then `$lib/ui/...`).

Then replace the `selectedSeason` / `seasonLabel` / `visiblePasses` derivations (lines 22-34) with:

```ts
    let selectedSeason = $derived(
        selectedMatch === null
            ? null
            : seasonStartYearFromDate(new Date(selectedMatch.date)),
    );
    let selectedSeasonLabel = $derived(
        selectedSeason === null ? '' : seasonLabel(selectedSeason),
    );
    let visiblePasses = $derived(passesForMatch(data.passes, selectedMatch?.date));
```

`selectedSeason` is kept because the empty-state copy needs the label. The local is renamed to `selectedSeasonLabel` so it does not shadow the imported `seasonLabel` function.

- [ ] **Step 2: Update the one reference to the renamed local**

Line 84 currently reads `No season pass for {seasonLabel} — <a`. Change it to:

```svelte
                No season pass for {selectedSeasonLabel} — <a
```

- [ ] **Step 3: Type-check**

Run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```
Expected: both exit 0.

- [ ] **Step 4: Verify no behaviour change in the browser**

At `/sales/new`:

1. With no match selected, the fieldset shows "Pick a match first — only passes from that match's season can be used."
2. Select a match. Only that season's passes appear.
3. Select a match from a season you own no pass for (create one via `/season` if needed). The copy reads "No season pass for 2023/2024 — create one before logging this sale." with the year pair rendered, not blank.

Step 3 is the one that catches the rename going wrong.

- [ ] **Step 5: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add "web/src/routes/(app)/sales/new/+page.svelte"
git commit -m "refactor(sales): use passesForMatch on the standalone new-sale page"
```

---

### Task 4: Server-side `canCreate` gate on the sales screen

**Note (round-2 review correction):** this task originally made the match fetch
season-aware (`/matches/season/:seasonStartYear`). That was reverted before shipping: new
sales can only ever be logged against the current season regardless of which season the
table is showing — a past-season match has already kicked off, and the kickoff guard on
`updateSale` means a sale created against it could never be marked SOLD. Fetching that
season's matches would just populate dead-end UI. The actual fix below moves the
"is a new sale even allowed here" decision server-side instead, so the round-1 client-side
`isCurrentSeasonSelected` check (which used `===` and read the raw, unsanitized `year`
param) doesn't wrongly block a future season or silently misfire on a bad `?year=`.

**Files:**
- Modify: `web/src/routes/(app)/sales/+page.server.ts:7-36`

**Interfaces:**
- Consumes: `seasonStartYearFromDate` from `$lib/season`.
- Produces: `load` returns `{ sales, year, editSale, matches, isNew, passes, canCreate }` —
  `year` is now the *sanitized* `seasonYear` (not the raw `year` param — a bad `?year=abc`
  or `?year=0` must resolve to the same behaviour as no `?year=` at all, not `NaN`), and
  `canCreate: boolean` is new. `matches` is unchanged in shape (still
  `/matches/current-season`) but is now only fetched when `canCreate` is true, skipping a
  wasted request when it's false.

This is an independent bug fix. It does not depend on Tasks 1-3 and could be done first.

- [ ] **Step 1: Hoist the season branch, compute `canCreate`, and gate the match fetch on it**

Replace lines 7-36 of `web/src/routes/(app)/sales/+page.server.ts` with:

```ts
export const load: PageServerLoad = async (event) => {
    const yearParam = event.url.searchParams.get('year');
    const year = yearParam ? Number.parseInt(yearParam, 10) : null;
    const editId = event.url.searchParams.get('edit');
    const isNew = event.url.searchParams.get('new') !== null;
    // `?year=` is a seasonStartYear, so it maps straight onto the
    // `/season/:seasonStartYear` routes for both sales and matches.
    const seasonYear = year && Number.isFinite(year) ? year : null;
    const salesPath =
        seasonYear !== null ? `/sales/season/${seasonYear}` : '/sales/current-season';

    const sales = await api<SaleListItem[]>(event, salesPath);

    let editSale: SaleDetail | null = null;

    if (editId && !isNew) {
        try {
            editSale = await api<SaleDetail>(event, `/sales/${editId}`);
        } catch {
            editSale = null;
        }
    }

    // New sales can only be logged against the current season or a season the
    // backend is already serving matches for — the kickoff guard on
    // updateSale means a past-season sale could never be marked SOLD, so the
    // UI never offers one. Computed here (not as `seasonYear === currentSeason`
    // on the client) because the backend's current-season bucketing
    // (`getCurrentSeason`, buckets on `earliestUpcoming ?? now`) can roll over
    // to next year's season before the calendar year does — a future
    // `seasonYear` can already be a season the backend is actively serving.
    const canCreate = seasonYear === null || seasonYear >= seasonStartYearFromDate(new Date());

    let matches: FormattedMatch[] = [];
    // Unfiltered on purpose: ImportSalesModal groups this list by season and
    // renders a "Previous seasons" section. The inline panels narrow it at
    // render time via passesForMatch.
    const passes = await api<SeasonPass[]>(event, '/season-passes');

    if (isNew && !editId && canCreate) {
        // /matches/current-season already returns matches earliest-first.
        matches = await api<FormattedMatch[]>(event, '/matches/current-season');
    }

    return { sales, year: seasonYear, editSale, matches, isNew, passes, canCreate };
};
```

Add the import: `import { seasonStartYearFromDate } from '$lib/season';` — already proven
safe as a server-side import elsewhere (`accounting/+page.server.ts`,
`season/+page.server.ts`).

`year` is now the sanitized `seasonYear`, not the raw param, so the season `<select>` and
the `+page.svelte` `canCreate`-driven gating both see a consistent, never-`NaN` value.

- [ ] **Step 2: Type-check**

Run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```
Expected: both exit 0.

- [ ] **Step 3: Verify in the browser**

1. Go to `/sales` (no `?year=`), click "+ New sale". The match dropdown lists current-season matches. Unchanged from before.
2. Pick a past season in the "Season" dropdown so the URL becomes `/sales?year=2023`. "+ New sale" is replaced with the "past season" message and the `/matches/current-season` request is skipped entirely (check the network tab).
3. Manually visit `/sales?year=abc` and `/sales?year=0`. Both behave identically to no `?year=` at all — current season, "+ New sale" available, correct dropdown selection — not a silently broken `NaN`.
4. If reachable, visit `/sales?year=<currentSeason + 1>` — a future season should still show "+ New sale" available, not the "past season" block message.
5. Cancel the panel and confirm the sales table still shows 2023 sales (the sales fetch must not have regressed while being refactored).
6. Open `/sales?year=2023&edit=<a 2023 sale id>`. The edit panel still opens; no match dropdown is expected there.

- [ ] **Step 4: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add "web/src/routes/(app)/sales/+page.server.ts"
git commit -m "fix(sales): compute the new-sale season gate server-side"
```

---

### Task 5: Filter the inline edit panel

**Files:**
- Modify: `web/src/routes/(app)/sales/+page.svelte` — the `<script>` block (add derivations near the existing `editSale` derivations around line 144) and the edit panel's "Tickets per pass" fieldset (around lines 514-524).

**Interfaces:**
- Consumes: `passesForMatch` from Task 1.
- Produces: `editVisiblePasses: SeasonPass[]` — used only inside this file.

- [ ] **Step 1: Add the derivations to the `<script>` block**

Add the import alongside the existing `$lib/types` import (around line 15):

```ts
    import { passesForMatch } from '$lib/sale-passes';
```

Then, directly below the existing `isPastMatch` derivation (which ends around line 147), add:

```ts
    // Keep any pass already allocated to this sale visible even if its season
    // disagrees — hiding its input would silently zero those tickets on save.
    let editAllocatedPassIds = $derived(
        new Set(
            (editSale?.Allocations ?? []).map((allocation) => allocation.seasonPassId),
        ),
    );
    let editVisiblePasses = $derived(
        editSale === null
            ? []
            : passesForMatch(data.passes, editSale.Match.date, editAllocatedPassIds),
    );
```

`editSale` is `SaleDetail | null` (it comes from `data.editSale`), so the `=== null` guard is what narrows it for the `.Match.date` access.

- [ ] **Step 2: Render from the filtered list, with an empty state**

In the edit panel's fieldset, replace the `{#each data.passes as pass, idx (pass.id)}` loop opener (around line 520) and its closing `{/each}` with an `{#if}` wrapper over `editVisiblePasses`. The full fieldset becomes:

```svelte
                <fieldset
                    class="sm:col-span-2 rounded border border-line p-3 space-y-2"
                >
                    <legend class="text-xs text-ink-muted px-1">
                        Tickets per pass
                    </legend>
                    {#if editVisiblePasses.length === 0}
                        <p class="text-xs text-negative-strong">
                            No season pass for this sale's season — <a
                                href="/season"
                                class="text-primary hover:text-primary-hover hover:underline"
                                >create one</a
                            > to change its allocations.
                        </p>
                    {:else}
                        {#each editVisiblePasses as pass, idx (pass.id)}
                            {@const current =
                                editSale.Allocations?.find(
                                    (alloc) => alloc.seasonPassId === pass.id,
                                )?.nbTickets ?? 0}
                            <label class="flex items-center justify-between gap-3">
                                <span class="text-sm text-ink-muted truncate">
                                    {pass.seasonStartYear} · {pass.label}
                                    <span class="text-ink-faint"
                                        >({pass.category} · {pass.row}/{pass.seat})</span
                                    >
                                </span>
                                {#if idx === 0}
                                    <input
                                        bind:this={firstFieldEl}
                                        type="number"
                                        name={`alloc_${pass.id}`}
                                        min="0"
                                        step="1"
                                        value={current}
                                        class="w-20 rounded border border-line-strong bg-surface text-ink px-2 py-1 text-right"
                                    />
                                {:else}
                                    <input
                                        type="number"
                                        name={`alloc_${pass.id}`}
                                        min="0"
                                        step="1"
                                        value={current}
                                        class="w-20 rounded border border-line-strong bg-surface text-ink px-2 py-1 text-right"
                                    />
                                {/if}
                            </label>
                        {/each}
                    {/if}
                </fieldset>
```

The `idx === 0` / `bind:this={firstFieldEl}` split is kept verbatim — it is what moves keyboard focus into the panel — and now indexes the filtered array, so focus lands on the first *visible* input.

- [ ] **Step 3: Type-check**

Run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```
Expected: both exit 0. A `'editSale' is possibly 'null'` error inside the `{#each}` means the enclosing `{#if editSale && editSale.id === saleId}` block (line ~359) was disturbed — restore it.

- [ ] **Step 4: Verify in the browser**

Preconditions: own at least one pass in the current season and at least one in an older season (create via `/season`).

1. `/sales`, click a sale row to open `?edit=<id>`. "Tickets per pass" now lists **only** current-season passes. Before this task the older-season pass was listed too — that is the bug being fixed.
2. Confirm the allocated pass rows still show their existing ticket counts.
3. Press Tab / observe focus: the cursor lands in the first visible ticket input.
4. Change a count, save, reopen. The new count persisted, and no allocation on a hidden pass was lost (`nbTickets` in the row matches the sum you entered).
5. `/sales?year=<an older season>`, open a sale from that season. Its own season's passes are listed, not the current season's.

- [ ] **Step 5: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add "web/src/routes/(app)/sales/+page.svelte"
git commit -m "fix(sales): filter the inline edit panel's pass list by the sale's season"
```

---

### Task 6: Filter the inline new-sale panel

**Files:**
- Modify: `web/src/routes/(app)/sales/+page.svelte` — the `<script>` block and the `newSalePanel` snippet (around lines 600-672).

**Interfaces:**
- Consumes: `passesForMatch` and `seasonLabel` from Task 1; the `passesForMatch` import added in Task 5.
- Produces: `newSaleMatchId: string`, `newSaleVisiblePasses: SeasonPass[]` — used only inside this file.

- [ ] **Step 1: Add state and derivations to the `<script>` block**

Add `seasonLabel` to the season import (there is no `$lib/season` import in this file yet — add one next to the `$lib/sale-passes` import from Task 5):

```ts
    import { seasonLabel } from '$lib/season';
```

Then add, near the existing `isNew` derivation (around line 169):

```ts
    let newSaleMatchId = $state('');

    let newSaleMatch = $derived(
        data.matches.find((match) => match.id === newSaleMatchId) ?? null,
    );
    let newSaleSeasonLabel = $derived(
        newSaleMatch === null
            ? ''
            : seasonLabel(seasonStartYearFromDate(new Date(newSaleMatch.date))),
    );
    let newSaleVisiblePasses = $derived(passesForMatch(data.passes, newSaleMatch?.date));
```

This needs `seasonStartYearFromDate` too, so the import is:

```ts
    import { seasonLabel, seasonStartYearFromDate } from '$lib/season';
```

- [ ] **Step 2: Reset the selection when the panel closes**

Add below the existing new-panel focus `$effect` (the one guarded by `if (isNew)`, around line 192):

```ts
    // The panel is a snippet inside the page, not a fresh component — without
    // this, reopening it inherits the previous pick and its filtered list.
    $effect(() => {
        if (!isNew) {
            newSaleMatchId = '';
        }
    });
```

- [ ] **Step 3: Bind the match `<select>`**

In the `newSalePanel` snippet, the select currently reads:

```svelte
                <select
                    bind:this={newPanelFirstEl}
                    name="matchId"
                    required
```

Add the value binding:

```svelte
                <select
                    bind:this={newPanelFirstEl}
                    bind:value={newSaleMatchId}
                    name="matchId"
                    required
```

`bind:this` and `bind:value` on the same element are fine in Svelte 5. `name="matchId"` stays so the form POST is unaffected.

- [ ] **Step 4: Replace the panel's pass fieldset**

Replace the whole fieldset (currently `{#if data.passes.length === 0}` / `{:else}` / `{#each data.passes …}`) with:

```svelte
            <fieldset class="sm:col-span-2 rounded border border-line p-3 space-y-2">
                <legend class="text-xs text-ink-muted px-1">Tickets per pass</legend>
                {#if newSaleMatch === null}
                    <p class="text-xs text-ink-faint">
                        Pick a match first — only passes from that match's season can be
                        used.
                    </p>
                {:else if newSaleVisiblePasses.length === 0}
                    <p class="text-xs text-negative-strong">
                        No season pass for {newSaleSeasonLabel} — <a
                            href="/season"
                            class="text-primary hover:text-primary-hover hover:underline"
                            >create one</a
                        > before logging this sale.
                    </p>
                {:else}
                    {#each newSaleVisiblePasses as pass (pass.id)}
                        <label class="flex items-center justify-between gap-3">
                            <span class="text-sm text-ink-muted truncate">
                                {pass.seasonStartYear} · {pass.label}
                                <span class="text-ink-faint"
                                    >({pass.category} · {pass.row}/{pass.seat})</span
                                >
                            </span>
                            <input
                                type="number"
                                name={`alloc_${pass.id}`}
                                min="0"
                                step="1"
                                value="0"
                                class="w-20 rounded border border-line-strong bg-surface text-ink px-2 py-1 text-right"
                            />
                        </label>
                    {/each}
                {/if}
            </fieldset>
```

The copy matches `/sales/new` word for word so the two new-sale forms read identically.

- [ ] **Step 5: Type-check**

Run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
```
Expected: both exit 0.

- [ ] **Step 6: Verify in the browser**

Preconditions as in Task 5: a current-season pass and an older-season pass.

1. `/sales`, click "+ New sale". The fieldset shows "Pick a match first…", **not** a pass list. Before this task it showed every pass from every season.
2. Pick a match. Only that season's passes appear.
3. Press Escape to close the panel, then reopen it. The match select is back to "Select a match…" and the hint is back — the reset effect works.
4. Fill in a pass count and a listed price, submit. The sale is created and appears in the table. No `SALE_ALLOCATION_PASS_MISMATCH` error.
5. `/sales?year=2023`. "+ New sale" is hidden with the "past season" message instead — Task 4's `canCreate` gate, not a season-aware match fetch — so this panel is unreachable for a past season at all.
6. Keyboard check: opening the panel still focuses the match select.

- [ ] **Step 7: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add "web/src/routes/(app)/sales/+page.svelte"
git commit -m "fix(sales): filter the inline new-sale panel's pass list by the selected match"
```

---

### Task 7: Season-correct year dropdown, and full verification

**Files:**
- Modify: `web/src/routes/(app)/sales/+page.svelte:46-47`

**Interfaces:**
- Consumes: `seasonStartYearFromDate` and `seasonLabel` from `$lib/season` (imported in Task 6).
- Produces: nothing.

**Round-2 review correction:** the original plan kept the `<option>` labels as bare years,
reasoning that relabelling was a separate UX change. That was wrong — switching the
`<option value>` from a calendar year to a season-start year changes what an unchanged-looking
label means for eight months of the year (Jan-Jul) with no visible cue. Step 2 below adds the
label fix that the original plan omitted.

- [ ] **Step 1: Seed the dropdown from the season year, not the calendar year**

Replace lines 46-47:

```ts
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
```

with:

```ts
    // Season years, not calendar years: between January and July the calendar
    // year names a season that has not started, and picking it now yields an
    // empty sales list and an empty match list.
    const currentSeason = seasonStartYearFromDate(new Date());

    // Union in `data.year` when a bookmarked/typed `?year=` falls outside the
    // usual six-season window — otherwise no <option> matches it, the browser
    // silently falls back to "Current", and the dropdown lies about which
    // season is actually loaded.
    let years = $derived.by(() => {
        const base = Array.from({ length: 6 }, (_, i) => currentSeason - i);

        if (data.year !== null && !base.includes(data.year)) {
            return [...base, data.year].sort((first, second) => second - first);
        }

        return base;
    });
```

`i` is the one permitted single-letter name here — it is the `Array.from` index callback, matching the existing code. Verify `currentYear` has no other references in the file before deleting it; if `grep -n 'currentYear' 'web/src/routes/(app)/sales/+page.svelte'` returns anything after this edit, those call sites need updating too.

**Round-2 review correction:** the plan originally had `years` as a plain `const` built once
from `currentSeason`. That drops a bookmarked or hand-typed `?year=` that falls outside the
six-season window: no `<option>` matches `data.year`, the `<select>` silently falls back to
its first option ("Current"), and the page then shows a season other than the one the label
claims. `years` must be a `$derived.by` that unions `data.year` into the base window whenever
it falls outside it, sorted back into descending order — reactive because `data.year` changes
on every `?year=` navigation.

- [ ] **Step 2: Label the dropdown options as seasons, not bare years**

The `<option>` in the season `<select>` currently renders `{year}`. Change it to render the
season label instead, using `seasonLabel` (already imported per the note above):

```svelte
                {#each years as year (year)}
                    <option value={year} selected={data.year === year}>{seasonLabel(year)}</option>
                {/each}
```

This is the label fix the original plan deferred as out of scope — see the note above the
Step 1 heading for why that was wrong.

- [ ] **Step 3: Type-check and lint the whole repo**

Run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory/web && npm run check && npm run typecheck
cd /Users/sufianesouissi/Development/psg_inventory && npm run typecheck && npm run lint && npm run lint:deps && npm test
```
Expected: all exit 0. The root `npm test` should be unchanged from `main` — this plan touches no backend file, so no backend test should have moved.

- [ ] **Step 4: Confirm the rule now lives in exactly one place**

Run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory && grep -rn "seasonStartYear ===" web/src/routes/
```
Expected: **no output**. Any hit means a hand-written copy of the filter survived and Tasks 2-6 missed a call site.

Run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory && grep -rn "passesForMatch\b" web/src/
```
Expected: exactly seven hits (`passesForMatch` itself — `[saleId]/+page.server.ts` doesn't
call it directly, see below).

| File | Hits |
|---|---|
| `web/src/lib/sale-passes.ts` | 3 (the definition, a doc-comment reference, and the call inside `passesForSale`) |
| `web/src/routes/(app)/sales/new/+page.svelte` | 2 (import + call) |
| `web/src/routes/(app)/sales/+page.svelte` | 2 (import + the new-panel call) |

Also run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory && grep -rn "passesForSale\b" web/src/
```
Expected: exactly five hits — `sale-passes.ts` (the definition), `[saleId]/+page.server.ts`
(import + call), and `+page.svelte` (import + the edit-panel call). `passesForSale` is the
sibling helper that builds the allocated-pass-id set from `sale.Allocations` and calls
`passesForMatch` internally, so the two edit call sites use it instead of calling
`passesForMatch` directly — this is why the counts above don't split evenly across the four
entry points.

Fewer hits than either expectation means a call site was missed; more means a duplicate
crept in.

- [ ] **Step 5: Confirm no backend file moved**

Run:
```bash
cd /Users/sufianesouissi/Development/psg_inventory && git diff --stat main -- src/
```
Expected: **no output**. Anything here violates the frontend-only constraint.

- [ ] **Step 6: Full manual regression pass**

1. `/sales` — table renders, sorting works, row click opens `?edit=`.
2. Inline edit panel: only the sale's season's passes; save works.
3. Inline new panel: "pick a match first" → filtered passes → create works.
4. `/sales?year=<older season>`: sales table shows that season; "+ New sale" is hidden with the "past season" message (`canCreate` is false); an edit panel opened from that table still filters passes to the sale's own season.
5. **Import CSV modal:** click "Import CSV". The pass picker still shows a "Current season" group **and** a populated "Previous seasons" group. This is the regression this plan's constraint exists to prevent — if "Previous seasons" is empty, someone season-scoped the pass load in `+page.server.ts`.
6. `/sales/new` and `/sales/<id>`: unchanged from Tasks 2-3.
7. Season dropdown: the topmost option is the current *season* start year, and every option is labelled as a season (e.g. "2023/2024"), not a bare year.
8. `/sales?year=abc` and `/sales?year=0`: both behave identically to no `?year=` at all — current season, "+ New sale" available.

- [ ] **Step 6: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add "web/src/routes/(app)/sales/+page.svelte"
git commit -m "fix(sales): offer season years in the season dropdown, not calendar years"
```

---

## Follow-up (tracked, not part of this plan)

Add vitest to `web/` and wire `web` typecheck + tests into CI, covering `seasonStartYearFromDate`, `seasonLabel`, and `passesForMatch`. `passesForMatch` is now the single point of failure for four sale forms and is a pure function with an obvious case table — in-season, off-season, nullish `matchDate`, union retention via `keepPassIds`, and input-order preservation. It should not be guarded by manual clicking indefinitely.
