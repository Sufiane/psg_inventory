# PSG-83 accounting page (matchday strip, waterfall) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Builder: `frontend-builder` only (frontend-only ticket, no backend task exists).

**Goal:** Rebuild `/accounting` to the stitch layout — four headline figures, `AmortisationBlock`, `MatchdayStrip`, the "How net profit is calculated" waterfall (`MathBlock`), `SeasonMatchTable` with totals, and a "Details" disclosure — season view full, `year=all` reduced to figures + waterfall + Details.

**Architecture:** Pure view logic (`accounting-view.ts`, vitest) computes segments and table groups from `FormattedMatch[] × SaleListItem[] × Amortization`; one rewritten `+page.server.ts` streams two promises (`accounting`, `seasonView`); three new thin components plus a page rewrite. Waterfall = figures + `MathBlock` chain, no chart (spec §2, D1).

**Tech Stack:** SvelteKit 2.61.1, Svelte 5.56.0 runes, Tailwind 4.3.0, Vitest 5.0.0 (node env), Playwright (`e2e/`). No new dependencies.

**Spec:** `docs/specs/2026-11-20-psg-83-accounting-page-design.md` (read §2 waterfall reconciliation, §4 load contract, §9 decisions D1–D10). Parent: `docs/plans/2026-11-19-stitch-redesign-plan.md` slice S6.

## Global constraints

Parent plan "Global Constraints" apply verbatim (pinned deps, no barrels, explicit return types, no single-letter names except `i/j/k` in indexed loops, no inline `if`, blank line before `if/for/while/return/throw`, no `!!`, numeric separators on 5+ digit literals, `readonly` on injected members, snake_case error codes, no comments unless a non-obvious why, sentence-case copy, no marketing words/exclamation marks, banned content list, four statuses only, negative profit uses `negative`, sign+label always with colour, conventional commits scope `web`, no PR numbers, stage and stop for `/crit`). Tests: a `describe` per condition ("when …"), `it` titles state the outcome only. Vitest, not Jest — run with `npm test` / `npx vitest run` in `web/`.

Branch is `kinshasa/psg-83-handle` today: rename to **`psg-83`** (lowercase key, zero-padded) **before first push**, never after a PR exists. Linear: move PSG-83 to In Progress before starting, In Review only when staged.

## Size and ticket split

Estimate (added plus removed, tests and docs included): about **650**, under the 800 cap, one PR, one actor (authenticated), one layer (web).

| Task group | Lines |
|---|---|
| T1 helpers + specs (`accounting-view.ts`) | ~170 |
| T2 load rewrite | ~40 (−30 old) |
| T3 components (`MatchdayStrip`, `AmortisationBlock`, `SeasonMatchTable`) | ~280 |
| T4 page rewrite + deletions | ~200 (−170 old) |
| T5 e2e + gate | ~40 |

Fallback if the builder lands above 800: split **S6a** (T1 + T2 + `MatchdayStrip` + `AmortisationBlock`, ~400) and **S6b** (T3 table + T4 page + T5, ~400, depends on S6a). Do not pre-split.

No backend work: verified the API already serves every field (spec §3) — `matchId` landed in PSG-77, shell/`?year=` in PSG-79, S1 primitives exist. Nothing to order before the frontend.

## File map

- Create `web/src/lib/accounting-view.ts`, `web/src/lib/accounting-view.spec.ts`
- Modify `web/src/routes/(app)/accounting/+page.server.ts`
- Create `web/src/lib/ui/MatchdayStrip.svelte`, `AmortisationBlock.svelte`, `SeasonMatchTable.svelte`
- Modify `web/src/routes/(app)/accounting/+page.svelte` (full rewrite)
- Modify `web/src/lib/ui/AccountingCard.svelte`, `LeadTimeStrip.svelte` (stale-class grep only; demoted into Details)
- Delete `web/src/lib/ui/AmortizationCard.svelte`, `web/src/lib/ui/AmortizationCardSkeleton.svelte` (verified: only this page imports them)
- Create `e2e/tests/accounting.e2e-spec.ts`

Untouched on purpose: `accounting-scope.ts` (+spec), `sale-math.ts`, `season.ts`, Dashboard/Matches/Sales routes (parallel slices S3–S5). `NetProfitSkeleton` stays in use here (figures pending state); `AccountingCardSkeleton` survives on Dashboard only (its delete condition belongs to S3, spec §8).

---

## Task 1: pure view helpers (TDD)

**Files:**
- Create: `web/src/lib/accounting-view.spec.ts`
- Create: `web/src/lib/accounting-view.ts`

**Interfaces (exact — later tasks depend on these):**
```ts
export function passCostPerMatch(passPrice: number, matchCount: number): number;

export type StripSegment = {
    matchId: MatchId;
    opponent: string;
    date: string;
    status: SaleStatus | null;
    isBreakEven: boolean;
};

export function stripSegments(
    matches: FormattedMatch[],
    salesByMatch: Record<string, SaleListItem[]>,
    breakEvenMatchId: MatchId | null,
): StripSegment[];

export type SeasonTableRow = {
    matchId: MatchId;
    opponent: string;
    date: string;
    competition: string;
    sales: SaleListItem[];
};

export function tableGroups(
    matches: FormattedMatch[],
    salesByMatch: Record<string, SaleListItem[]>,
): SeasonTableRow[];
```
Consumes: `groupSalesByMatch`, `dominantStatus` from `$lib/sale-math.ts` (landed in S1); types from `$lib/types`.

- [ ] **Step 1: Write the failing spec** `web/src/lib/accounting-view.spec.ts`. Imports: `describe/it/expect` from `vitest`, the three functions, plus builders local to the spec. Keep builders tiny and explicit, e.g. a `match(id, opponent, date)` helper returning `{ id, date, atHome: true, competition: 'CHAMPIONSHIP', opponent }` and a `sale(id, matchId, status)` helper returning a `SaleListItem` with `nbTickets: 1, listedPrice: 10, profit: 10, invest: 0`, a fixed `opponent` and `Gift: null`. Test cases, each in its own nested `describe`:

```ts
import { describe, expect, it } from 'vitest';
import type { MatchId } from '@psg/shared/ids';
import { passCostPerMatch, stripSegments, tableGroups } from './accounting-view';
import type { FormattedMatch, SaleListItem, SaleStatus } from './types';

function match(id: string, opponent: string, date: string): FormattedMatch {
    return {
        id: id as MatchId,
        date,
        atHome: true,
        competition: 'CHAMPIONSHIP',
        opponent,
    };
}

function sale(id: string, matchId: string, status: SaleStatus): SaleListItem {
    return {
        id: id as SaleListItem['id'],
        matchId: matchId as MatchId,
        listedPrice: 10,
        profit: 10,
        invest: 0,
        nbTickets: 1,
        status,
        opponent: { id: 'op1' as SaleListItem['opponent']['id'], name: 'Rival FC' },
        matchDate: '2026-09-01T15:00:00.000Z',
        Gift: null,
    };
}

describe('passCostPerMatch', () => {
    describe('when 19 matches are given', () => {
        it('divides the pass price by the match count', () => {
            expect(passCostPerMatch(190, 19)).toBe(10);
        });
    });

    describe('when zero matches are given', () => {
        it('returns 0', () => {
            expect(passCostPerMatch(190, 0)).toBe(0);
        });
    });
});

describe('stripSegments', () => {
    describe('when a match has no sale', () => {
        it('gives the segment a null status', () => {
            const segments = stripSegments([match('m1', 'Rival FC', '2026-09-01')], {}, null);

            expect(segments).toHaveLength(1);
            expect(segments[0]?.status).toBeNull();
            expect(segments[0]?.opponent).toBe('Rival FC');
        });
    });

    describe('when SOLD and PENDING sales share a match', () => {
        it('gives the segment status SOLD', () => {
            const segments = stripSegments(
                [match('m1', 'Rival FC', '2026-09-01')],
                { m1: [sale('s1', 'm1', 'PENDING'), sale('s2', 'm1', 'SOLD')] },
                null,
            );

            expect(segments[0]?.status).toBe('SOLD');
        });
    });

    describe('when the break-even match is given', () => {
        it('flags only that segment', () => {
            const segments = stripSegments(
                [match('m1', 'A', '2026-09-01'), match('m2', 'B', '2026-09-08'), match('m3', 'C', '2026-09-15')],
                {},
                'm2' as MatchId,
            );

            expect(segments.map((segment) => segment.isBreakEven)).toEqual([false, true, false]);
        });
    });

    describe('when two matches are given', () => {
        it('returns one segment per match in input order', () => {
            const segments = stripSegments(
                [match('m1', 'A', '2026-09-01'), match('m2', 'B', '2026-09-08')],
                {},
                null,
            );

            expect(segments.map((segment) => segment.matchId)).toEqual(['m1', 'm2']);
            expect(segments.map((segment) => segment.date)).toEqual([
                '2026-09-01',
                '2026-09-08',
            ]);
        });
    });
});

describe('tableGroups', () => {
    describe('when a match has two sales', () => {
        it('returns one group holding both sales in input order', () => {
            const groups = tableGroups(
                [match('m1', 'Rival FC', '2026-09-01')],
                { m1: [sale('s1', 'm1', 'SOLD'), sale('s2', 'm1', 'GIFTED')] },
            );

            expect(groups).toHaveLength(1);
            expect(groups[0]?.sales.map((row) => row.id)).toEqual(['s1', 's2']);
            expect(groups[0]?.competition).toBe('CHAMPIONSHIP');
        });
    });

    describe('when a match has no sale', () => {
        it('omits the match', () => {
            const groups = tableGroups(
                [match('m1', 'Rival FC', '2026-09-01')],
                { m1: [] },
            );

            expect(groups).toEqual([]);
        });
    });

    describe('when a sale references a match missing from the list', () => {
        it('appends the orphan group last', () => {
            const groups = tableGroups(
                [match('m1', 'A', '2026-09-01')],
                {
                    m1: [sale('s1', 'm1', 'SOLD')],
                    orphan: [sale('s2', 'orphan', 'SOLD')],
                },
            );

            expect(groups.map((group) => group.matchId)).toEqual(['m1', 'orphan']);
            expect(groups[1]?.opponent).toBe('Rival FC');
            expect(groups[1]?.date).toBe('2026-09-01T15:00:00.000Z');
        });
    });
});
```

- [ ] **Step 2:** `cd web && npx vitest run src/lib/accounting-view.spec.ts`. Expect FAIL (module missing).
- [ ] **Step 3: Implement** `web/src/lib/accounting-view.ts`:

```ts
import type { MatchId } from '@psg/shared/ids';
import type { FormattedMatch, SaleListItem, SaleStatus } from './types';
import { dominantStatus } from './sale-math';

export function passCostPerMatch(passPrice: number, matchCount: number): number {
    if (matchCount === 0) {
        return 0;
    }

    return passPrice / matchCount;
}

// StripSegment type as in the Interfaces block above.

export function stripSegments(
    matches: FormattedMatch[],
    salesByMatch: Record<string, SaleListItem[]>,
    breakEvenMatchId: MatchId | null,
): StripSegment[] {
    return matches.map((match) => {
        const sales = salesByMatch[match.id] ?? [];
        const statuses = sales.map((sale) => sale.status);

        return {
            matchId: match.id,
            opponent: match.opponent,
            date: match.date,
            status: dominantStatus(statuses),
            isBreakEven: breakEvenMatchId !== null && match.id === breakEvenMatchId,
        };
    });
}

// SeasonTableRow type as in the Interfaces block above.

export function tableGroups(
    matches: FormattedMatch[],
    salesByMatch: Record<string, SaleListItem[]>,
): SeasonTableRow[] {
    const groups: SeasonTableRow[] = [];
    const listed = new Set<string>();

    for (const match of matches) {
        const sales = salesByMatch[match.id] ?? [];

        if (sales.length === 0) {
            continue;
        }

        listed.add(match.id);
        groups.push({
            matchId: match.id,
            opponent: match.opponent,
            date: match.date,
            competition: match.competition,
            sales,
        });
    }

    for (const [matchId, sales] of Object.entries(salesByMatch)) {
        if (sales.length === 0 || listed.has(matchId)) {
            continue;
        }

        groups.push({
            matchId: matchId as MatchId,
            opponent: sales[0]?.opponent.name ?? '',
            date: sales[0]?.matchDate ?? '',
            competition: '',
            sales,
        });
    }

    return groups;
}
```
  Adjust imports to the real brand-type path used elsewhere in `web/src/lib` (check how `types.ts` imports `MatchId`). No comments except where a why is non-obvious (the orphan-append rule is such a why — one line max).
- [ ] **Step 4:** Rerun `npx vitest run src/lib/accounting-view.spec.ts`. Expect PASS. Then `npx vitest run` (whole web suite) — nothing else may break. Then `npm run check && npm run typecheck` in `web/`: PASS (explicit return types enforced).

## Task 2: load rewrite

**Files:**
- Modify: `web/src/routes/(app)/accounting/+page.server.ts` (full replacement; keep `accounting-scope.ts` untouched)

**Interfaces (Produces):** `PageServerLoad` returns
`{ accounting: Promise<TimePeriodAccounting>, seasonView: Promise<{ amortization: Amortization | null; matches: FormattedMatch[]; sales: SaleListItem[] }>, season: SeasonYear | 'all' }`.
The old `view`/`year` fields are gone (spec §4); Task 4's page is their only consumer.

- [ ] **Step 1: Replace the file body** with:

```ts
import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { Amortization, FormattedMatch, SaleListItem, TimePeriodAccounting } from '$lib/types';
import type { SeasonYear } from '@psg/shared/time';
import { seasonStartYearFromDate } from '$lib/season';
import { resolveAccountingScope } from './accounting-scope';

export const load: PageServerLoad = (event) => {
    const scope = resolveAccountingScope(event.url);
    const currentYear = seasonStartYearFromDate(new Date());
    const season: SeasonYear | 'all' =
        scope.view === 'all-time' ? 'all' : (scope.year ?? currentYear);

    if (season === 'all') {
        return {
            accounting: api<TimePeriodAccounting>(event, '/accounting/all-time'),
            seasonView: Promise.resolve({ amortization: null, matches: [], sales: [] }),
            season,
        };
    }

    const isCurrent = season === currentYear;
    const accountingPath = isCurrent
        ? '/accounting/current-season'
        : `/accounting/season/${season}`;
    const matchesPath = isCurrent
        ? '/matches/current-season'
        : `/matches/season/${season}`;
    const salesPath = isCurrent ? '/sales/current-season' : `/sales/season/${season}`;

    return {
        accounting: api<TimePeriodAccounting>(event, accountingPath),
        seasonView: Promise.all([
            api<Amortization | null>(event, `/accounting/amortization/${season}`),
            api<FormattedMatch[]>(event, matchesPath),
            api<SaleListItem[]>(event, salesPath),
        ]).then(([amortization, matches, sales]) => ({ amortization, matches, sales })),
        season,
    };
};
```
  No `withResult` on the matches call (D7 — accounting renders no scores). Promises stay unawaited (streaming). Note: `Promise.resolve({ amortization: null, ... })` must typecheck against the promised shape — if TS widens `null`, annotate the constant (`const emptySeasonView: Promise<…> = Promise.resolve(…)`); the exported `load` return type must remain assignable to `PageServerLoad`.
- [ ] **Step 2:** `cd web && npm run check && npm run typecheck`. Expect PASS (the old page still compiles — it reads `view`/`year`? It does: this task intentionally breaks Task-not-yet-done, so **run only typecheck here and expect the `+page.svelte` errors**, or better: land Tasks 2 and 4 as one review unit if the builder prefers green at every step — acceptable either way; do not "fix" the page by re-adding old fields).
- [ ] **Step 3:** `npx vitest run src/routes` — `accounting-scope.spec.ts` must stay PASS (helper untouched).

## Task 3: components

**Files:**
- Create: `web/src/lib/ui/MatchdayStrip.svelte`
- Create: `web/src/lib/ui/AmortisationBlock.svelte`
- Create: `web/src/lib/ui/SeasonMatchTable.svelte`
- Modify: `web/src/lib/ui/AccountingCard.svelte`, `LeadTimeStrip.svelte` (stale-class grep only)

No component harness exists (parent F2) — these are verified by `check`/`typecheck` here and by e2e + manual pass in Task 5. Each component: `lang="ts"` script, `$props()` destructure with inline types, explicit function return types, `$derived` for computed display values.

- [ ] **Step 1: `MatchdayStrip.svelte`.** Props `{ segments }: { segments: StripSegment[] }`; imports `StripSegment` from `$lib/accounting-view`, `shortDate` from `$lib/format`. Structure:

```svelte
<ol aria-label="Matchday strip" class="flex gap-1">
    {#each segments as segment (segment.matchId)}
        {@const label = `${segment.opponent}, ${shortDate(segment.date)}, ${segment.status ?? 'no sale'}${segment.isBreakEven ? ', break-even' : ''}`}
        <li class="flex-1 min-w-0" aria-label={label} title={label}>
            <span
                class="flex h-7 items-center justify-center rounded-sm {fillFor(segment.status)}"
                aria-hidden="true"
            >
                {#if segment.isBreakEven}<span class="text-surface-subtle">★</span>{/if}
            </span>
            <span class="mt-1 block truncate text-center text-[0.6rem] text-ink-faint">
                {shortDate(segment.date)}
            </span>
        </li>
    {/each}
</ol>
```
  with `function fillFor(status: SaleStatus | null): string` returning exactly: `SOLD → 'bg-positive'`, `PENDING → 'bg-warning'`, `CANCELLED → 'bg-[#6e5d6d]'`, `GIFTED → 'bg-gift'`, `null → 'bg-line-strong'` (D5 fills, parent S6 step 5; `#6e5d6d` is a non-text fill — one short why-comment allowed). Legend **below** the `<ol>`: a `<ul aria-hidden="true">` (labels are decorative; segments carry the real text) of five swatch + label pairs — Sold, Pending, Gifted, Cancelled, No sale — each swatch `h-3 w-6 rounded-sm` with the same fills, plus a final item "★ break-even". Empty `segments`: render nothing (`{#if segments.length > 0}` wrapper) — the page shows the section skeleton instead.
- [ ] **Step 2: `AmortisationBlock.svelte`.** Props `{ data, matchCount }: { data: Amortization; matchCount: number }`; imports `passCostPerMatch` from `$lib/accounting-view`, `BreakEvenBar`, `money`, `signedMoney`, `shortDate` from `$lib/format`, `page` from `$app/state`, `carrySeason` from `$lib/season`. Derived: `hasPass = data.hasPass && data.passPrice > 0`; `cleared = hasPass && data.breakEven !== null`. Section `aria-labelledby="amort-heading"`, heading h2 "Season pass per match". Branches:
  - `!hasPass`: paragraph "No season pass set." + link `carrySeason('/season', page.url)` labelled "Add one on the Season page" (classes `text-primary font-medium hover:text-primary-hover hover:underline`).
  - `hasPass && matchCount === 0`: sentence "No fixtures in this season."
  - else equation line, visually one row: `<span class="font-mono">{money(data.passPrice)}</span> <span class="text-ink-faint">÷</span> <span class="font-mono">{matchCount}</span> fixtures <span class="text-ink-faint">=</span> <span class="font-mono font-semibold">{money(passCostPerMatch(data.passPrice, matchCount))}</span>` with an `aria-label` spelling "divided by"/"equals" (screen readers don't read ÷/= usefully here).
  - Always when `hasPass`: `BreakEvenBar progress={data.progress} hasPass={data.hasPass}`; then the preserved headline (D3): `<p class="font-mono …">{cleared ? '+' : ''}{signedMoney(cleared ? data.surplus : data.remaining)}</p>` with label "Surplus over pass" / "Remaining to clear" and tone `positive-strong` / `warning-strong` (ink when `perMatch.length === 0`, mirroring the old card), plus the cleared line "Cleared at {opponent} on {shortDate(date)}." when `cleared && data.breakEven`.
  - Deliberately absent: the per-match cumulative `<details>` list (spec §6/D3) — do not port it.
- [ ] **Step 3: `SeasonMatchTable.svelte`.** Props `{ groups, summary }: { groups: SeasonTableRow[]; summary: SalesSummary }`; imports `SeasonTableRow` from `$lib/accounting-view`, `SalesSummary`, `saleNet` from `$lib/sale-math`, `StatusChip`, `money`, `signedMoney`, `shortDate`, `competitionLabel`. Markup:
  - `<table class="w-full text-sm">` inside a `<section aria-labelledby="season-matches-heading">` with h2 "Matches this season".
  - `<thead>` column headers in DOM order: Match, Competition, Tickets, Listed price, Invest, Net, Status.
  - One `<tbody>` per group: `{#each groups as group (group.matchId)}` → `{#each group.sales as sale (sale.id)}`. Every row repeats Match cell (`{group.opponent}` + `{shortDate(group.date)}` in one cell, `whitespace-nowrap`), Competition (`competitionLabel(group.competition)`; empty string → `—`), Tickets (`sale.nbTickets`), Listed price, Invest, Net, Status. Cell rules (D5): if `sale.status === 'GIFTED' && sale.Gift` → price cell `Gifted to {sale.Gift.Recipient.name}`, net cell `—`; `sale.status === 'SOLD'` → price `money(sale.listedPrice)`, net `signedMoney(saleNet(sale))`; otherwise price `money(sale.listedPrice)`, net `—`. Invest cell always `money(sale.invest)`. Status cell: `<StatusChip status={sale.status} />`. No inline `if` in markup — compute display strings in tiny helper functions in the script block (`priceText(sale): string`, `netText(sale): string`, both with explicit `string` return types), each branch a braced multi-line `if`.
  - Empty `groups`: one `<tbody>` with a single row `<td colspan="7" class="text-ink-muted">No sales this season.</td>`.
  - `<tfoot>` **always rendered** (D4): one row, `<td colspan="7">` containing a flex-wrap of labelled totals from `summary`: `Tickets {summary.tickets}`, `Proceeds (SOLD) {money(summary.proceedsSold)}`, `Invest (SOLD) {money(summary.investSold)}`, and emphasised `Net before season pass {signedMoney(summary.netSold)}`. Labelled, not column-aligned (spec §6 why).
- [ ] **Step 4: token/stale-class pass.** `grep -rn "shadow-\|bg-primary\|border-primary\|old palette" web/src/lib/ui/AccountingCard.svelte web/src/lib/ui/LeadTimeStrip.svelte` — fix any hit to the S1 token equivalents (`bg-brand text-on-brand` for fills, `text-primary` for links). Expected near-no-op; do not restructure either component (they are demoted by Task 4, not edited).
- [ ] **Step 5:** `cd web && npm run check && npm run typecheck && npx vitest run`. Expect PASS.

## Task 4: page rewrite and deletions

**Files:**
- Rewrite: `web/src/routes/(app)/accounting/+page.svelte`
- Delete: `web/src/lib/ui/AmortizationCard.svelte`, `web/src/lib/ui/AmortizationCardSkeleton.svelte`

**Interfaces (Consumes):** Task 1 helpers, Task 2 data shape, Task 3 component props; `MathBlock`, `AccountingCard`, `LeadTimeStrip`, `NetProfitSkeleton`, `Skeleton` (all landed); `signedMoney`/`money` from `$lib/format`; `summarizeSales`, `groupSalesByMatch` from `$lib/sale-math`.

- [ ] **Step 1: New script block.** `let { data }: { data: PageData } = $props();`. Derived: `isAll = data.season === 'all'`. Delete the old `tab` derived, all `Amortization*` and `AccountingCardSkeleton` imports, and the now-unused `seasonStartYearFromDate`. Keep `money`, `signedMoney` from `$lib/format`. New imports: the three new components, `MathBlock`, `Skeleton`, `NetProfitSkeleton`, `AccountingCard`, `LeadTimeStrip`; `stripSegments`, `tableGroups` from `$lib/accounting-view`; `groupSalesByMatch`, `summarizeSales` from `$lib/sale-math`; `carrySeason` from `$lib/season`. Because the page interleaves two data sources (spec §5 order), the four figure numbers are computed by one helper reused by both `accounting` blocks (same arithmetic as today — acceptance requires figures equal Dashboard's):

```ts
function figuresOf(accounting: TimePeriodAccounting): {
    realizedProceeds: number;
    realizedInvest: number;
    seasonInvest: number;
    netProfit: number;
} {
    const realizedProceeds = accounting.realized?.totalProfit ?? 0;
    const realizedInvest = accounting.realized?.totalInvest ?? 0;
    const seasonInvest = accounting.totalSeasonInvestment;

    return {
        realizedProceeds,
        realizedInvest,
        seasonInvest,
        netProfit: realizedProceeds - realizedInvest - seasonInvest,
    };
}
```
- [ ] **Step 2: Page structure** (top to bottom). The master-plan section order (figures → block → strip → waterfall → table → Details) interleaves the two promises, so the page uses five `{#await}` blocks over the same two promises: each promise is created once in the load, so repeat awaits attach to it (already-resolved promises render `{:then}` immediately; no refetch). Only the **first** block of each promise renders the error banner — later `{:catch}` blocks render nothing (one why-comment):

```svelte
<h1 class="text-2xl font-display font-semibold tracking-tight text-ink">
    {isAll ? 'Accounting' : 'Season accounting'}
</h1>

{#await data.accounting}
    <NetProfitSkeleton />
{:then accounting}
    {@const figures = figuresOf(accounting)}
    … A1: four figures (Step 3.1) …
{:catch err}
    <p role="alert" class="rounded-lg border border-negative bg-negative/5 text-negative-strong text-sm px-4 py-3">
        Failed to load accounting: {err?.message ?? 'unknown error'}
    </p>
{/await}

{#if !isAll}
    {#await data.seasonView}
        <Skeleton height="6rem" width="100%" rounded="rounded-lg" />
        <Skeleton height="7rem" width="100%" rounded="rounded-lg" />
    {:then view}
        {@const salesByMatch = groupSalesByMatch(view.sales)}
        … S1: AmortisationBlock + MatchdayStrip (Step 4) …
    {:catch err}
        <p role="alert" class="rounded-lg border border-negative bg-negative/5 text-negative-strong text-sm px-4 py-3">
            Failed to load matchday details: {err?.message ?? 'unknown error'}
        </p>
    {/await}
{/if}

{#await data.accounting}
    <Skeleton height="8rem" width="100%" rounded="rounded-lg" />
{:then accounting}
    {@const figures = figuresOf(accounting)}
    … A2: waterfall (Step 3.2) …
{:catch}
    <!-- failure banner already rendered by A1 -->
{/await}

{#if !isAll}
    {#await data.seasonView}
        <Skeleton height="12rem" width="100%" rounded="rounded-lg" />
    {:then view}
        {@const salesByMatch = groupSalesByMatch(view.sales)}
        … S2: SeasonMatchTable (Step 4) …
    {:catch}
        <!-- failure banner already rendered by S1 -->
    {/await}
{/if}

{#await data.accounting}
    <Skeleton height="6rem" width="100%" rounded="rounded-lg" />
{:then accounting}
    … A3: Details (Step 3.3) …
{:catch}
    <!-- failure banner already rendered by A1 -->
{/await}
```
  `year=all` renders only A1, A2, A3 — figures + waterfall + Details (Q12), no extra fetch.

- [ ] **Step 3: accounting-block content:**
  1. **A1 — four figures.** `<section aria-labelledby="figures-heading">` with real h2 "Season figures". Grid `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`. **Net realized profit** first, `lg:col-span-full` (full row on lg), `text-3xl font-display`, tone `figures.netProfit < 0 ? 'text-negative-strong' : figures.netProfit > 0 ? 'text-positive-strong' : 'text-ink'`, `{signedMoney(figures.netProfit)}`, `data-numeric`; remaining three cards in the same grid: **Realized proceeds** (`signedMoney(figures.realizedProceeds)`, hint "(SOLD)"), **Pending** (`signedMoney(accounting.pending?.totalProfit ?? 0)` + `{accounting.pending?.totalSales ?? 0} tickets` secondary), **Season pass cost** (`money(figures.seasonInvest)`, or "Not set" + link `carrySeason('/season', page.url)` labelled "Set it on the Season page" when `figures.seasonInvest === 0 && !isAll`). Every figure: label + value + sign, colour never alone. Use braced `{#if}` blocks, never inline `if`, for the tone class and the not-set branch (or precompute tone/label strings in small script helpers with explicit `string` returns).
  2. **A2 — waterfall.** h2 "How net profit is calculated" then
     ```svelte
     <MathBlock
         lines={[
             { label: 'Realized proceeds (SOLD)', value: figures.realizedProceeds, sign: 'plus' },
             { label: 'Ticket invest', value: figures.realizedInvest, sign: 'minus' },
             { label: 'Season pass', value: figures.seasonInvest, sign: 'minus' },
         ]}
         resultLabel="Net realized profit"
         result={figures.netProfit}
     />
     ```
     No tax/audit/commission copy anywhere (Q13: commission stays unnamed).
  3. **A3 — Details.** `<details>` with `<summary class="cursor-pointer …">Details</summary>`; inside: `{#if accounting.leadTime && accounting.leadTime.soldCount >= 3}<LeadTimeStrip data={accounting.leadTime} />{/if}` then `<AccountingCard title="Realized" data={accounting.realized} showSeason={isAll} showDate={!isAll} />` (exactly today's mapping). The Unrealized/Pending cards and the season-investments row/seat list are dropped (D6, spec §8 — flagged for user overrule). `AccountingCardSkeleton` no longer appears in the page (A1's `NetProfitSkeleton` is the pending state; A2/A3 use `Skeleton`) — its Dashboard usage keeps the file alive.
- [ ] **Step 4: seasonView blocks:**
  - **S1a:** `{#if view.amortization}<AmortisationBlock data={view.amortization} matchCount={view.matches.length} />{/if}`
  - **S1b:** `{#if view.matches.length > 0}<MatchdayStrip segments={stripSegments(view.matches, salesByMatch, view.amortization?.breakEven?.matchId ?? null)} />{/if}` (`salesByMatch` is the block-level `{@const}` from Step 2).
  - **S2:** `<SeasonMatchTable groups={tableGroups(view.matches, salesByMatch)} summary={summarizeSales(view.sales)} />` — render even with zero matches (empty-state row + totals, so the e2e totals assertion is seed-independent).
- [ ] **Step 5: Delete** `AmortizationCard.svelte` and `AmortizationCardSkeleton.svelte`. Then `grep -rn "AmortizationCard" web/src` — expect no hits. Confirm `grep -rn "AccountingCardSkeleton\|NetProfitSkeleton" web/src` — `NetProfitSkeleton` still hits this page + dashboard; `AccountingCardSkeleton` hits dashboard only (kept — it is out of this ticket's delete scope, spec §8).
- [ ] **Step 6:** `cd web && npm run check && npm run typecheck && npx vitest run`. Expect PASS.
- [ ] **Step 7: Manual via `/run`** (dev server): `/accounting` — season title, four figures, amortisation block (with a seeded pass and without: the no-pass link carries `year`), strip with legend + dates, waterfall lines matching the figures, table with totals; `/accounting?year=all` — figures + waterfall + Details only, title "Accounting"; `/accounting?view=all-time` — same as all (legacy); `/accounting?year=<past>` — season title, past-season table; tab order reaches summary → details; strip segments announce opponent/date/status; `grep -rn "shadow-\|AmortizationCard" web/src` empty of `AmortizationCard` and of `shadow-` on this page.

## Task 5: e2e smoke, gate, stage

**Files:**
- Create: `e2e/tests/accounting.e2e-spec.ts`

- [ ] **Step 1:** Write the smoke:

```ts
import { expect, test } from '@playwright/test';
import { E2E_OPPONENT_NAME } from '../fixtures';

test.describe('season accounting', () => {
    test('shows title, matchday strip for the seeded match and totals', async ({ page }) => {
        await page.goto('/accounting');

        await expect(page.getByRole('heading', { level: 1, name: 'Season accounting' })).toBeVisible();

        const strip = page.getByRole('list', { name: 'Matchday strip' });

        await expect(strip.getByRole('listitem', { name: new RegExp(E2E_OPPONENT_NAME) })).toHaveCount(1);

        await expect(page.getByText('Net before season pass')).toBeVisible();
    });
});
```
  Why these three facts: they hold regardless of whether a parallel spec currently leaves a sale behind (seed has exactly one upcoming match; the totals footer is always rendered with zeros — spec §10). Do not assert sales counts.
- [ ] **Step 2: Per-slice gate** in `web/`: `npm run check && npm run typecheck && npm test && npm run build && test -f .svelte-kit/cloudflare/_worker.js`. All PASS; build exit 0 alone is not evidence.
- [ ] **Step 3: e2e.** From `e2e/` (seeded env per `docs/plans/2026-09-26-psg-35-e2e-ci-integration.md` — use the repo's documented e2e run): new `accounting` spec green; `auth`, `sale`, `season-pass` still green. If `sale` or `season-pass` reaches for anything this page removed — they don't today — fix the spec, not the page, and note it in the PR.
- [ ] **Step 4: Manual acceptance sweep** (spec §10): season selector changes all four streams; `year=all` hides block/strip/table; figures equal Dashboard's for the same season (open both, compare); break-even marker matches `Amortization.breakEven` (seed a pass + SOLD sale via UI); no-pass state links correctly; reduced-motion (no new transitions added); keyboard pass.
- [ ] **Step 5: Stage and stop** for the user to run `/crit`. Do not commit until told. Commit message when told: `feat(web): rebuild accounting with matchday strip and match table` (plus the harness attribution line). Move PSG-83 to In Review only once staged. Rename branch to `psg-83` before first push (never after a PR exists).

## Acceptance

Season view: h1 "Season accounting"; strip segment count equals fixture count; break-even marker equals `Amortization.breakEven.matchId`; four figures and MathBlock use the same three inputs (net = proceeds − invest − pass) and equal Dashboard for the same season; table rows are per sale grouped per match with gifted/cancelled rules and an always-visible totals row labelled "Net before season pass"; Details holds LeadTimeStrip (≥ 3 sold) and the Realized card. `year=all`: figures + waterfall + Details only, title "Accounting". Legacy `?view=all-time` resolves. No backend change; no new dependency; `AmortizationCard*` gone; gate + all e2e green; all new logic vitest-covered.

## Self-review

- Spec coverage: waterfall (§2 → T4 Step 3.2), load contract (§4 → T2), layout (§5 → T4), three components (§6 → T3), helpers (§7 → T1), kept/demoted/deleted + D6 drops (§8 → T3 Step 4, T4 Steps 3.3/5), decisions D1–D10 (§9 → cited inline), testing (§10 → T1/T5), parallelism (§11 → file map).
- Placeholder scan: all code blocks concrete — full test file (T1), full load body
  (T2), component markup skeletons with exact classes/labels/branch rules (T3), page
  structure and call sites (T4), full e2e spec (T5); no "TBD" or "handle edge cases".
- Type consistency: `StripSegment`/`SeasonTableRow` defined once (T1 Interfaces) and consumed identically in T3/T4; load fields (`accounting`, `seasonView`, `season`) defined in T2 match every access in T4; `summary: SalesSummary` matches `summarizeSales`'s return; component props match every call site in T4.
- Known risks: (1) T2 temporarily leaves `+page.svelte` type-broken until T4 — acceptable mid-plan, green at Task end; (2) totals/strip are new e2e surface — mitigated to seed-independent assertions; (3) D3/D6 are capability drops flagged in the spec for user overrule before implementation.
