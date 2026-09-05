# Season-Pass / Match-Season Mismatch Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the sale forms from offering season passes that belong to a different season than the sale's match, and pin the existing server-side guards with regression tests.

**Architecture:** The backend already enforces `pass.seasonStartYear === seasonStartYearFromDate(match.date)` in `SalesService.validateAllocations()`, and the CSV import path re-resolves `matchId` from the pass season, so the mismatch-validation fix itself needed **no backend production code changes** — Tasks 1-2 below add regression tests only. The frontend fix is entirely in the SvelteKit app: a small local season-bucket helper plus a filtered pass list on the new-sale page (reactive, driven by the selected match) and the edit-sale page (computed in `load`, since the match is fixed). *(See the Amendment section below: a separate UTC-consistency bug found in code review did require backend production edits, made after this plan's original tasks were complete.)*

**Tech Stack:** NestJS 11 + Jest (backend, `src/`), SvelteKit 2 + Svelte 5 runes + Tailwind 4 (frontend, `web/`), shared branded types in `@psg/shared/*` (types only, `.d.ts`, no runtime code).

**Spec:** `docs/specs/2026-09-04-season-pass-mismatch-fix-design.md`

## Amendment (post-review, backend production files)

This plan originally scoped backend work as test-only (see the "No production file under
`src/` may be modified" constraint below, and the local-time bucket function it prescribed).
That constraint applied to the season/pass-mismatch validation itself, which was indeed
already correctly enforced server-side and needed no behavior change — only regression
tests, per Tasks 1-2.

Code review surfaced a **separate** bug in the same area: season classification
(`seasonStartYearFromDate`) and season range/boundary construction (`new Date(year, 7, 1)`
style calls used to build query ranges) were inconsistent in how they read a `Date` —
classification used UTC getters while range construction used local-time getters. On a
non-UTC host, a match near the Aug 1 boundary could be *classified* into season N by one
code path but *excluded* from season N's query range by another — the same bug class the
original fix targeted, one level down. That is a production defect, not a documentation or
test gap, and fixing it required editing backend production files. The test-only constraint
above was correct for the mismatch-validation fix this plan was written for; it did not
anticipate this UTC-consistency bug and does not apply to it.

Round 1 (in response to the first review pass) converted the season-classification getters
in `src/api/sales/sales.service.ts`, `src/api/accounting/accounting.service.ts`, and
`src/api/season-passes/season-passes.service.ts` to UTC (`getUTCMonth()`/`getUTCFullYear()`).
Round 2 (this review pass) found the matching range-construction calls in those same files —
plus `src/db/matches/matches.service.ts`, which drives CSV-import match resolution and was
missed in round 1 — were still local-time, and fixed all of them by moving to a shared,
UTC-only `seasonStartYearFromDate` / `getSeasonRange` / `getSeasonBounds` set of helpers in
`src/shared/utils/season.utils.ts`, consolidating what had been four duplicate copies of the
classification logic. See `src/shared/utils/season.utils.ts` and its spec for the resulting
single source of truth.

## Global Constraints

- A season runs Aug 1 → Jul 31. `seasonStartYear` is the calendar year of that August. This
  plan originally specified the bucket function as local-time
  (`date.getMonth() < 7 ? date.getFullYear() - 1 : date.getFullYear()`) in both
  `web/src/lib/season.ts` and the backend, "mirroring the backend copies". In practice both
  sides were subsequently converted to UTC getters (`getUTCMonth()`/`getUTCFullYear()`) —
  `web/src/lib/season.ts` explicitly to keep client-side bucketing consistent with the
  backend (which runs in UTC), and the backend via the Amendment above. Treat the UTC form as
  current; the local-time form described here was superseded during implementation.
- ~~No production file under `src/` may be modified by this plan. Backend work is
  test-only.~~ Superseded by the Amendment above: this held for the mismatch-validation fix
  Tasks 1-2 implement, but not for the separate UTC-consistency bug found in review, which
  required editing backend production files (see Amendment).
- `web/` has **no test runner** (no vitest, no `test` script). Do not add one — it is an explicitly tracked follow-up, out of scope here. Frontend tasks are verified by `npm run check` in `web/` plus the manual browser script in Task 6.
- Code style (enforced by eslint + repo convention): explicit return types on every exported function; no single-letter variable names (`allocation`, `pass`, `match`, never `a`/`p`/`m`); blank line before `if` / `for` / `return` / `throw` unless it is the first statement in its block; no inline `if`; no `!!`.
- Jest specs: one `describe` per condition under test (`when …`), `it` titles state only the outcome.
- Commit messages follow conventional commits (commitlint is installed). Commit after each task.
- Dependencies are pinned to exact versions; this plan adds no dependencies.

## Parallelism

Tasks 1-2 (backend, test-only) and Tasks 3-5 (frontend) touch **disjoint files and share no state**. They can be executed in parallel by separate workers. Task 6 (manual verification) depends on Tasks 3-5 only.

---

## Part A — Backend regression tests (test-only, no production changes)

### Task 1: Pin the season-mismatch rejection on `updateSale`

`sales.service.spec.ts` already covers the mismatch on `addSale`. The `updateSale` path — the
one the edit-sale page drives — is uncovered, even though `updateSale` calls the same
`validateAllocations()` whenever `payload.allocations != null`.

**Files:**
- Modify: `src/api/sales/sales.service.spec.ts` (append a new `describe` after the existing `describe('addSale allocations', …)` block, inside `describe('SalesService', …)`)
- Test: same file

**Interfaces:**
- Consumes (all already defined in the spec file's setup): `service: SalesService`, `salesDbService`, `matchesDbService`, `seasonPassesDbService` mocks; fixtures `saleFixture(matchDate: Date, status?: SaleStatus): Sale`, `matchFixture(date: Date): Match`, `passFixture(overrides?: Partial<SeasonPass>): SeasonPass`; constants `userId`, `saleId`, `matchId`, `passId`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing-guard test**

Append inside `describe('SalesService', …)`, after the `describe('addSale allocations', …)` block:

```ts
    describe('updateSale allocations', () => {
        const futureMatchDate = new Date(Date.now() + 60 * 60_000);

        describe('when the pass belongs to a different season than the match', () => {
            beforeEach(() => {
                salesDbService.getOneSale.mockResolvedValue(saleFixture(futureMatchDate));
                matchesDbService.getOneMatch.mockResolvedValue(
                    matchFixture(new Date('2024-09-15')),
                );
                seasonPassesDbService.findById.mockResolvedValue(
                    passFixture({ seasonStartYear: 2023 }),
                );
            });

            it('rejects the update with SALE_ALLOCATION_PASS_MISMATCH', async () => {
                const payload: UpdateSaleDto = {
                    saleId,
                    sold: false,
                    allocations: [{ seasonPassId: passId, nbTickets: 2 as TicketCount }],
                } as UpdateSaleDto;

                await expect(service.updateSale(userId, payload)).rejects.toMatchObject({
                    code: ErrorCode.SALE_ALLOCATION_PASS_MISMATCH,
                });
            });

            it('does not write the sale', async () => {
                const payload: UpdateSaleDto = {
                    saleId,
                    sold: false,
                    allocations: [{ seasonPassId: passId, nbTickets: 2 as TicketCount }],
                } as UpdateSaleDto;

                await expect(service.updateSale(userId, payload)).rejects.toThrow(
                    DomainException,
                );

                expect(salesDbService.updateSale).not.toHaveBeenCalled();
            });
        });

        describe('when the pass belongs to the same season as the match', () => {
            beforeEach(() => {
                salesDbService.getOneSale.mockResolvedValue(saleFixture(futureMatchDate));
                matchesDbService.getOneMatch.mockResolvedValue(
                    matchFixture(new Date('2024-09-15')),
                );
                seasonPassesDbService.findById.mockResolvedValue(passFixture());
            });

            it('writes the allocations through to the db layer', async () => {
                const allocations = [
                    { seasonPassId: passId, nbTickets: 2 as TicketCount },
                ];

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        sold: false,
                        allocations,
                    } as UpdateSaleDto),
                ).resolves.toBeUndefined();

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ saleId, userId, allocations }),
                );
            });
        });
    });
```

All identifiers used above (`DomainException`, `ErrorCode`, `UpdateSaleDto`, `TicketCount`)
are already imported at the top of this spec file — do not add imports.

Note on the fixtures: `saleFixture` sets `matchId` to the shared `matchId` constant and
`passFixture()` defaults to `seasonStartYear: 2024`, which matches a `2024-09-15` match.
`futureMatchDate` keeps the unrelated kickoff guard from firing.

- [ ] **Step 2: Run the new tests and verify they pass against the current guard**

```bash
npx jest src/api/sales/sales.service.spec.ts -t "updateSale allocations"
```

Expected: 3 passing tests.

- [ ] **Step 3: Prove the tests actually bite (temporary mutation)**

In `src/api/sales/sales.service.ts`, temporarily comment out the season check inside
`validateAllocations()`:

```ts
            // if (pass.seasonStartYear !== matchSeason) {
            //     throw new DomainException(ErrorCode.SALE_ALLOCATION_PASS_MISMATCH);
            // }
```

Run:

```bash
npx jest src/api/sales/sales.service.spec.ts -t "updateSale allocations"
```

Expected: the two tests under `when the pass belongs to a different season than the match`
FAIL. If they still pass, the test is not exercising the guard — fix the test before moving on.

- [ ] **Step 4: Revert the mutation**

```bash
git checkout -- src/api/sales/sales.service.ts
git diff --stat
```

Expected: only `src/api/sales/sales.service.spec.ts` is modified. `src/api/sales/sales.service.ts`
must show no changes.

- [ ] **Step 5: Run the full backend suite**

```bash
npm test
```

Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/sales/sales.service.spec.ts
git commit -m "test(sales): pin season-mismatch rejection on updateSale allocations"
```

---

### Task 2: Pin the CSV-import rejection of a foreign-season match

The existing `'re-resolves matchId server-side and rejects a tampered row'` test tampers with
the row *date* so nothing resolves within the same season. This task adds the distinct
scenario the spec calls out: a row carrying a `matchId` from a **different season's** match.
`commit()` fetches home matches for the *pass* season only, so that match is not in the
lookup, the row resolves to `error:match-missing`, and the commit is rejected wholesale.

**Files:**
- Modify: `src/api/sales-import/sales-import.service.spec.ts` (append inside `describe('commit', …)`, after the existing tampered-row test)
- Test: same file

**Interfaces:**
- Consumes (already defined in the spec file): `service: SalesImportService`, mocks `matchesDb`, `passesDb`, `importDb`; fixtures `passFixture(overrides: Partial<SeasonPass>): SeasonPass`, `matchFixture(): Match`; constants `userId`, `passAId`, `matchId`; `validDto: CommitRequestDto` declared at the top of the `commit` describe.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the test**

Append inside `describe('commit', …)`, after the existing
`it('re-resolves matchId server-side and rejects a tampered row', …)`:

```ts
        describe('when a row names a match from another season', () => {
            const foreignMatchId = '44444444-4444-4444-4444-444444444444';

            beforeEach(() => {
                passesDb.findById.mockResolvedValue(passFixture({}));
                matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
            });

            it('throws IMPORT_ROWS_INVALID', async () => {
                const crossSeason: CommitRequestDto = {
                    ...validDto,
                    rows: [
                        {
                            ...validDto.rows[0]!,
                            date: '2024-09-14',
                            matchId: foreignMatchId,
                        },
                    ],
                };

                await expect(service.commit(userId, crossSeason)).rejects.toMatchObject({
                    code: ErrorCode.IMPORT_ROWS_INVALID,
                });
            });

            it('creates no sales', async () => {
                const crossSeason: CommitRequestDto = {
                    ...validDto,
                    rows: [
                        {
                            ...validDto.rows[0]!,
                            date: '2024-09-14',
                            matchId: foreignMatchId,
                        },
                    ],
                };

                await expect(service.commit(userId, crossSeason)).rejects.toThrow(
                    DomainException,
                );

                expect(importDb.bulkCreate).not.toHaveBeenCalled();
            });
        });
```

Why this is the right assertion: `passFixture({})` has `seasonStartYear: 2025`, so
`commit()` calls `getHomeMatchesForSeason(2025)` and the mock returns only the 2025-09-14
match. The row's `2024-09-14` date resolves to nothing, `validateCommitRows` marks it
`error:match-missing`, and the client-supplied `matchId` is discarded. All identifiers used
(`CommitRequestDto`, `DomainException`, `ErrorCode`) are already imported in this spec file.

- [ ] **Step 2: Run the new tests**

```bash
npx jest src/api/sales-import/sales-import.service.spec.ts -t "when a row names a match from another season"
```

Expected: 2 passing tests.

- [ ] **Step 3: Prove they bite (temporary mutation)**

In `src/api/sales-import/sales-import.service.ts`, temporarily neutralise the error gate in
`commit()`:

```ts
        if (false && validated.summary.errors > 0) {
            throw new DomainException(ErrorCode.IMPORT_ROWS_INVALID);
        }
```

Run:

```bash
npx jest src/api/sales-import/sales-import.service.spec.ts -t "when a row names a match from another season"
```

Expected: both new tests FAIL.

- [ ] **Step 4: Revert the mutation**

```bash
git checkout -- src/api/sales-import/sales-import.service.ts
git diff --stat
```

Expected: only `src/api/sales-import/sales-import.service.spec.ts` is modified.

- [ ] **Step 5: Run the full backend gate**

```bash
npm test && npm run typecheck && npm run lint && npm run lint:deps
```

Expected: all four pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/sales-import/sales-import.service.spec.ts
git commit -m "test(sales-import): pin rejection of a commit row naming another season's match"
```

---

## Part B — Frontend pass filtering

### Task 3: Add the web-local season helper

`shared/` is `.d.ts`-only, so the backend helper cannot be imported. This is a deliberate
local copy, mirroring the backend's local-time semantics exactly.

**Files:**
- Create: `web/src/lib/season.ts`
- Test: none — `web/` has no test runner (out of scope, see Global Constraints). Verification is `npm run check`.

**Interfaces:**
- Consumes: `SeasonYear` from `@psg/shared/time` (branded `number`).
- Produces: `seasonStartYearFromDate(date: Date): SeasonYear` — used by Tasks 4 and 5.

- [ ] **Step 1: Create the file**

```ts
import type { SeasonYear } from '@psg/shared/time';

const AUGUST = 7;

// A season runs Aug 1 -> Jul 31; anything before August belongs to the previous start year.
export function seasonStartYearFromDate(date: Date): SeasonYear {
    return (
        date.getMonth() < AUGUST ? date.getFullYear() - 1 : date.getFullYear()
    ) as SeasonYear;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm --prefix web run check
```

Expected: 0 errors, 0 warnings (`noUnusedLocals` is on, so an unused export in a `$lib` module is fine but an unused import is not).

- [ ] **Step 3: Sanity-check the bucketing by hand**

```bash
node -e "const f=(d)=>d.getMonth()<7?d.getFullYear()-1:d.getFullYear();console.log(f(new Date('2025-09-14')),f(new Date('2026-03-01')),f(new Date('2025-07-31')),f(new Date('2025-08-01')));"
```

Expected output: `2025 2025 2024 2025`

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/season.ts
git commit -m "feat(web): add local season-start-year helper"
```

---

### Task 4: Filter the new-sale pass list by the selected match

**Files:**
- Modify: `web/src/routes/(app)/sales/new/+page.svelte` (script block lines 1-9; match `<select>` lines 33-45; `<fieldset>` lines 48-79)
- Unchanged: `web/src/routes/(app)/sales/new/+page.server.ts` — it must keep loading the full `/season-passes` list, because the page filters client-side as the match changes.

**Interfaces:**
- Consumes: `seasonStartYearFromDate(date: Date): SeasonYear` from `$lib/season` (Task 3); `data.matches: FormattedMatch[]` (`{ id: MatchId; date: string; atHome: boolean; competition: string; opponent: OpponentName }`), `data.passes: SeasonPass[]` (`{ id; price; seasonStartYear: SeasonYear; label; category; row; seat }`), `data.presetMatchId: string | null` — all already returned by the existing `load`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the script block**

Replace lines 1-9 of `web/src/routes/(app)/sales/new/+page.svelte` with:

```svelte
<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import { competitionLabel, dateTime } from '$lib/format';
    import { seasonStartYearFromDate } from '$lib/season';
    import Spinner from '$lib/ui/Spinner.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    let submitting = $state(false);
    let selectedMatchId = $state(data.presetMatchId ?? '');
    let selectedMatch = $derived(
        data.matches.find((match) => match.id === selectedMatchId) ?? null,
    );
    let selectedSeason = $derived(
        selectedMatch === null
            ? null
            : seasonStartYearFromDate(new Date(selectedMatch.date)),
    );
    let seasonLabel = $derived(
        selectedSeason === null ? '' : `${selectedSeason}/${selectedSeason + 1}`,
    );
    let visiblePasses = $derived(
        selectedSeason === null
            ? []
            : data.passes.filter((pass) => pass.seasonStartYear === selectedSeason),
    );
</script>
```

Do not inline `selectedMatch.date` into the `visiblePasses` filter callback — TypeScript
drops the non-null narrowing inside a closure and `npm run check` will fail. The
`selectedSeason` intermediate exists for that reason.

- [ ] **Step 2: Bind the match select**

Replace the `<select>` element (currently lines 33-45) with:

```svelte
        <select
            name="matchId"
            required
            bind:value={selectedMatchId}
            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
        >
            <option value="">Select a match…</option>
            {#each data.matches as match (match.id)}
                <option value={match.id}>
                    {dateTime(match.date)}, {match.atHome ? 'vs' : '@'} {match.opponent}
                    ({competitionLabel(match.competition)})
                </option>
            {/each}
        </select>
```

The old `selected={data.presetMatchId === match.id}` attribute is gone — `bind:value` on the
select, seeded from `data.presetMatchId`, now drives the initial selection.

- [ ] **Step 3: Replace the fieldset body with the three-state pass list**

Replace the `<fieldset>` block (currently lines 48-79) with:

```svelte
    <fieldset class="rounded border border-line p-3 space-y-2">
        <legend class="text-sm text-ink-muted px-1">Tickets per pass</legend>

        {#if selectedMatch === null}
            <p class="text-xs text-ink-faint">
                Pick a match first — only passes from that match's season can be used.
            </p>
        {:else if visiblePasses.length === 0}
            <p class="text-xs text-negative-strong">
                No season pass for {seasonLabel} — <a
                    href="/season"
                    class="text-primary hover:text-primary-hover hover:underline">create one</a
                > before logging this sale.
            </p>
        {:else}
            {#each visiblePasses as pass (pass.id)}
                <label class="flex items-center justify-between gap-3">
                    <span class="text-sm text-ink-muted truncate">
                        {pass.seasonStartYear} · {pass.label}
                        <span class="text-ink-faint">
                            ({pass.category} · {pass.row}/{pass.seat})
                        </span>
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

Passes filtered out have no `<input>` in the DOM, so they cannot be submitted — that is what
makes the fix real rather than cosmetic.

- [ ] **Step 4: Typecheck**

```bash
npm --prefix web run check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add "web/src/routes/(app)/sales/new/+page.svelte"
git commit -m "fix(web): only offer passes from the selected match's season on new sale"
```

---

### Task 5: Filter the edit-sale pass list by the sale's own match season

The match is fixed here and already known in `load`, so the filter runs server-side — no
client JS needed and `+page.svelte` needs no change.

**Files:**
- Modify: `web/src/routes/(app)/sales/[saleId]/+page.server.ts` (the `load` function, lines 1-15)
- Unchanged: `web/src/routes/(app)/sales/[saleId]/+page.svelte` — it already iterates `data.passes`.

**Interfaces:**
- Consumes: `seasonStartYearFromDate(date: Date): SeasonYear` from `$lib/season` (Task 3); `SaleDetail.Match.date: string`, `SaleDetail.Allocations?: SaleAllocation[]` where `SaleAllocation = { id?: SeasonPassId; seasonPassId: SeasonPassId; nbTickets: TicketCount }`; `SeasonPass.seasonStartYear: SeasonYear`.
- Produces: `data.passes` narrowed to the sale's season plus any already-allocated pass.

- [ ] **Step 1: Replace the imports and `load`**

Replace lines 1-15 of `web/src/routes/(app)/sales/[saleId]/+page.server.ts` with:

```ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import { parseAllocationsFromForm } from '$lib/sale-allocations';
import { seasonStartYearFromDate } from '$lib/season';
import type { SaleDetail, SeasonPass } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const { saleId } = event.params;
    const [sale, passes] = await Promise.all([
        api<SaleDetail>(event, `/sales/${saleId}`),
        api<SeasonPass[]>(event, '/season-passes'),
    ]);

    const saleSeason = seasonStartYearFromDate(new Date(sale.Match.date));
    const allocatedPassIds = new Set(
        (sale.Allocations ?? []).map((allocation) => allocation.seasonPassId),
    );
    // Keep any pass already allocated to this sale visible, even if its season
    // disagrees — hiding it would silently drop those tickets on the next save.
    const visiblePasses = passes.filter(
        (pass) => pass.seasonStartYear === saleSeason || allocatedPassIds.has(pass.id),
    );

    return { sale, passes: visiblePasses };
};
```

Leave the `actions` block below untouched.

- [ ] **Step 2: Typecheck**

```bash
npm --prefix web run check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Confirm no other route was touched**

```bash
git status --porcelain web/src
```

Expected: only `web/src/routes/(app)/sales/[saleId]/+page.server.ts` is modified.
`web/src/routes/(app)/sales/+page.server.ts` must stay unmodified — the sales list
intentionally loads every season's passes to label historical allocations.

- [ ] **Step 4: Commit**

```bash
git add "web/src/routes/(app)/sales/[saleId]/+page.server.ts"
git commit -m "fix(web): scope edit-sale pass list to the sale's match season"
```

---

### Task 6: Manual browser verification

`web/` has no test runner, so this script is the acceptance evidence for Tasks 3-5. Run it
after those three tasks are merged into the working tree. Record pass/fail per check.

**Files:** none modified.

**Prerequisites:** at least two season passes in **different** seasons on the test account
(create a second one at `/season` if needed) and at least one match in the current season.

- [ ] **Step 1: Start the backend**

```bash
npm run start:dev
```

Expected: Nest starts and listens; no unhandled exceptions in the log.

- [ ] **Step 2: Start the web app in a second terminal**

```bash
BACKEND_URL=http://localhost:3000 npm --prefix web run dev
```

Expected: Vite prints a local URL (usually `http://localhost:5173`). Adjust the port in
`BACKEND_URL` if the Nest log shows a different one. Log in as the test user.

- [ ] **Step 3: Check the new-sale empty state**

Open `/sales/new`. With the match select still on "Select a match…":

Expected: the "Tickets per pass" fieldset shows **"Pick a match first — only passes from
that match's season can be used."** and **no** number inputs.

- [ ] **Step 4: Check the new-sale filter**

Pick any match from the select.

Expected: the fieldset now lists **only** passes whose leading year equals the match's
season start year (a match in Sep 2025 → only `2025 · …` passes). Passes from other seasons
are absent, not merely disabled.

- [ ] **Step 5: Check reactivity**

Change the select to a different match, then back.

Expected: the pass list updates on every change with no page reload, and any number typed
into a pass that disappears is not resubmitted (the input is removed from the DOM).

- [ ] **Step 6: Check the preset-match deep link**

Open `/sales/new?matchId=<id of a current-season match>` (copy an id from the select's HTML
or from the matches list).

Expected: the select is pre-selected on that match **and** the pass list is already filtered
to its season on first paint — no "pick a match first" hint.

- [ ] **Step 7: Create a sale end-to-end**

Fill one pass with `2`, set a listed price, submit.

Expected: redirect to `/sales`, the new sale is listed, and **no**
`SALE_ALLOCATION_PASS_MISMATCH` error appears.

- [ ] **Step 8: Check the edit-sale page**

Open the sale you just created from `/sales`.

Expected: "Tickets per pass" lists only passes from that sale's match season, with the
existing allocation pre-filled at `2`. Save with no changes.

Expected: redirect to `/sales`, no error, ticket counts unchanged.

- [ ] **Step 9: Confirm the server guard is still the backstop**

With the app running, POST a crafted mismatch directly (substitute a real JWT, a real
current-season `matchId`, and the id of a pass from a *different* season):

```bash
curl -i -X POST http://localhost:3000/sales \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <JWT>' \
  -d '{"matchId":"<current-season-match-id>","listedPrice":100,"allocations":[{"seasonPassId":"<other-season-pass-id>","nbTickets":1}]}'
```

Expected: a 4xx response whose body contains `SALE_ALLOCATION_PASS_MISMATCH`.

- [ ] **Step 10: Final gate**

```bash
npm test && npm run typecheck && npm run lint && npm run lint:deps && npm --prefix web run check
```

Expected: all pass.

```bash
git status --porcelain
```

Expected: clean tree (everything committed in Tasks 1-5), and `git diff main --stat` shows
exactly five files: two backend spec files, `web/src/lib/season.ts`,
`web/src/routes/(app)/sales/new/+page.svelte`,
`web/src/routes/(app)/sales/[saleId]/+page.server.ts`.

---

## Out of scope (tracked follow-up)

**Add web unit test infra (vitest) to `web/`**, covering `seasonStartYearFromDate` and other
pure frontend logic, and wire `web` typecheck + tests into `.github/workflows/ci.yml` (CI
currently runs backend checks only). `seasonStartYearFromDate` is deliberately written as a
pure exported function so it is testable the moment that infra lands. Do **not** do this work
as part of this plan.
