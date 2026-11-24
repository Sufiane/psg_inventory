# PSG-90 Log sale live net preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/sales/new`, show a live "Net on this sale" card and make the form status-aware (Pending, Sold, Gifted) with a prefilled, hinted invest.

**Architecture:** Web only. Reuse the PSG-92 `SaleProfitBlock` and `computeDraftBreakdown` untouched. Add two small pure helpers (status copy, invest suggestion), one card component, and a server action that creates the sale with its status in one `POST /sales` call (atomic backend create, PSG-104).

**Tech Stack:** SvelteKit 5 (runes), Tailwind, vitest, Playwright e2e.

**Spec:** `docs/specs/2026-11-22-psg-90-log-sale-live-net-preview-design.md`

## Global Constraints

- Web only, and blocked by PSG-104 (atomic `POST /sales` with `status`, `recipientName`, optional `listedPrice` for gifts) being merged. No change to `src/` (backend), schema, `@psg/shared`, `SaleProfitBlock.svelte` or `sale-math.ts`.
- Commission rate comes from `data.commissionPercent` (`GET /sales/commission`). Never hardcode 12 in the web.
- No "x tickets" line: the net must equal the ledger row net (`profit - invest`, profit ignores ticket count).
- Keep the labels `Listed price (€)` and `Create sale` (the e2e helper finds them by name).
- Code style: explicit return types, no inline `if`, blank line before `if`/`for`/`return`/`throw`, no single-letter names, numeric separators on 5+ digit literals, no barrel files, no comments unless the why is non-obvious. Error messages in the form action are user copy, as in the existing action.
- Vitest: one nested `describe` per condition ("when ..."), short `it` titles stating only the outcome.
- Conventional commits (`feat(web): ...`), lowercase imperative. Do not commit until the user has run `/crit`: stage and stop. Do not put PR numbers in titles or bodies.
- Branch must be named `psg-90` before any push.

## Size and ticket split

One PR. Layer: web. Actor: athlete. No split needed.

| Task | Est. lines (tests included) |
|---|---|
| 1 `sale-outcome.ts` + spec | 60 |
| 2 `sale-invest.ts` + spec | 85 |
| 3 `new/read-payload.ts` + spec | 130 |
| 4 `new/+page.server.ts` | 50 |
| 5 `SaleOutcomeCard.svelte` | 55 |
| 6 `new/+page.svelte` | 170 |
| 7 e2e | 45 |
| 8 tech-debt entry | 8 |
| Total | about 600, under the 800 cap |

Backend independence: nothing for `backend-builder`. Frontend tasks 1, 2, 3 and 5 are independent of each other; 4 needs 3; 6 needs 1, 2, 4, 5; 7 needs 6.

Follow-up tickets (file them, not footnotes): (a) remove or replace the inline `/sales?new=1` panel, (b) plum Cancelled note in the edit drawer using `saleOutcomeNote`.

---

### Task 1: Status copy helper

**Files:**
- Create: `web/src/lib/sale-outcome.ts`
- Test: `web/src/lib/sale-outcome.spec.ts`

**Interfaces:**
- Consumes: `SaleStatus` from `web/src/lib/types.ts`.
- Produces: `type OutcomeTone = 'warning' | 'sunk' | 'gift'`; `type OutcomeNote = { tone: OutcomeTone; label: string }`; `saleOutcomeNote(status: SaleStatus, recipientName: string): OutcomeNote | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { saleOutcomeNote } from './sale-outcome';

describe('saleOutcomeNote', () => {
    describe('when the status is PENDING', () => {
        it('returns the amber not-yet-realized note', () => {
            expect(saleOutcomeNote('PENDING', '')).toEqual({
                tone: 'warning',
                label: 'Not yet realized',
            });
        });
    });

    describe('when the status is CANCELLED', () => {
        it('returns the plum sunk note', () => {
            expect(saleOutcomeNote('CANCELLED', '')).toEqual({
                tone: 'sunk',
                label: 'Sunk, no proceeds',
            });
        });
    });

    describe('when the status is GIFTED', () => {
        describe('and a recipient name is given', () => {
            it('names the recipient, trimmed', () => {
                expect(saleOutcomeNote('GIFTED', '  Lucas ')).toEqual({
                    tone: 'gift',
                    label: 'Gifted to Lucas, no cash',
                });
            });
        });

        describe('and the recipient name is blank', () => {
            it('falls back to a neutral placeholder', () => {
                expect(saleOutcomeNote('GIFTED', '   ')?.label).toBe(
                    'Gifted to a recipient, no cash',
                );
            });
        });
    });

    describe('when the status is SOLD', () => {
        it('returns null', () => {
            expect(saleOutcomeNote('SOLD', '')).toBeNull();
        });
    });
});
```

- [ ] **Step 2: Run it, expect FAIL (module missing)**

Run (from `web/`): `npx vitest run src/lib/sale-outcome.spec.ts`

- [ ] **Step 3: Implement**

```ts
import type { SaleStatus } from './types';

export type OutcomeTone = 'warning' | 'sunk' | 'gift';

export type OutcomeNote = { tone: OutcomeTone; label: string };

export function saleOutcomeNote(
    status: SaleStatus,
    recipientName: string,
): OutcomeNote | null {
    switch (status) {
        case 'PENDING':
            return { tone: 'warning', label: 'Not yet realized' };
        case 'CANCELLED':
            return { tone: 'sunk', label: 'Sunk, no proceeds' };
        case 'GIFTED': {
            const name = recipientName.trim();

            return { tone: 'gift', label: `Gifted to ${name || 'a recipient'}, no cash` };
        }
        default:
            return null;
    }
}
```

- [ ] **Step 4: Run, expect PASS.** Stage: `git add web/src/lib/sale-outcome.ts web/src/lib/sale-outcome.spec.ts`

---

### Task 2: Invest suggestion helper

**Files:**
- Create: `web/src/lib/sale-invest.ts`
- Test: `web/src/lib/sale-invest.spec.ts`

**Interfaces:**
- Consumes: `passCostPerMatch(passPrice: number, matchCount: number): number` from `web/src/lib/accounting-view.ts`; `SeasonPass` type.
- Produces: `suggestedInvest(input: { passes: SeasonPass[]; ticketsByPassId: Record<string, number>; homeFixtures: number }): { amount: number; tickets: number; costPerTicket: number } | null`. `costPerTicket` is the summed per-match cost of the passes that have tickets, divided by the ticket total, used for the hint.

Semantics: for each pass with `tickets > 0`, add `passCostPerMatch(pass.price, homeFixtures) * tickets`. `amount` is that sum rounded to a whole euro (`Math.round`). Returns `null` when `homeFixtures` is 0 or no tickets are chosen.

- [ ] **Step 1: Write the failing test.** Build passes with a local factory `makePass(id: string, price: number): SeasonPass` that casts a minimal object (`as unknown as SeasonPass`, test-only).

```ts
import { describe, expect, it } from 'vitest';
import { suggestedInvest } from './sale-invest';
import type { SeasonPass } from './types';

function makePass(id: string, price: number): SeasonPass {
    return { id, price } as unknown as SeasonPass;
}

describe('suggestedInvest', () => {
    describe('when there are no home fixtures', () => {
        it('returns null', () => {
            const passes = [makePass('a', 1_900)];

            expect(
                suggestedInvest({ passes, ticketsByPassId: { a: 1 }, homeFixtures: 0 }),
            ).toBeNull();
        });
    });

    describe('when no tickets are chosen', () => {
        it('returns null', () => {
            const passes = [makePass('a', 1_900)];

            expect(
                suggestedInvest({ passes, ticketsByPassId: { a: 0 }, homeFixtures: 19 }),
            ).toBeNull();
        });
    });

    describe('when one pass has one ticket', () => {
        it('returns the pass price divided by home fixtures', () => {
            const passes = [makePass('a', 1_900)];

            expect(
                suggestedInvest({ passes, ticketsByPassId: { a: 1 }, homeFixtures: 19 }),
            ).toEqual({ amount: 100, tickets: 1, costPerTicket: 100 });
        });
    });

    describe('when two passes contribute tickets', () => {
        it('sums the weighted per-match costs', () => {
            const passes = [makePass('a', 1_900), makePass('b', 950)];

            expect(
                suggestedInvest({
                    passes,
                    ticketsByPassId: { a: 1, b: 2 },
                    homeFixtures: 19,
                }),
            ).toEqual({ amount: 200, tickets: 3, costPerTicket: 200 / 3 });
        });
    });

    describe('when the cost is not a whole euro', () => {
        it('rounds the amount to the nearest euro', () => {
            const passes = [makePass('a', 1_000)];

            expect(
                suggestedInvest({ passes, ticketsByPassId: { a: 1 }, homeFixtures: 19 })
                    ?.amount,
            ).toBe(53);
        });
    });

    describe('when a pass has no entry in the ticket map', () => {
        it('ignores that pass', () => {
            const passes = [makePass('a', 1_900), makePass('b', 950)];

            expect(
                suggestedInvest({ passes, ticketsByPassId: { a: 1 }, homeFixtures: 19 })
                    ?.tickets,
            ).toBe(1);
        });
    });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/lib/sale-invest.spec.ts`

- [ ] **Step 3: Implement**

```ts
import { passCostPerMatch } from './accounting-view';
import type { SeasonPass } from './types';

export type InvestSuggestion = {
    amount: number;
    tickets: number;
    costPerTicket: number;
};

export function suggestedInvest(input: {
    passes: SeasonPass[];
    ticketsByPassId: Record<string, number>;
    homeFixtures: number;
}): InvestSuggestion | null {
    const { passes, ticketsByPassId, homeFixtures } = input;
    let total = 0;
    let tickets = 0;

    for (const pass of passes) {
        const count = ticketsByPassId[pass.id] ?? 0;

        if (count <= 0) {
            continue;
        }

        total += passCostPerMatch(pass.price, homeFixtures) * count;
        tickets += count;
    }

    if (homeFixtures === 0 || tickets === 0) {
        return null;
    }

    return { amount: Math.round(total), tickets, costPerTicket: total / tickets };
}
```

Note the "no home fixtures" spec relies on the guard order: with `homeFixtures` 0, `passCostPerMatch` returns 0, `tickets` is positive, and the guard still returns null.

- [ ] **Step 4: Run, expect PASS.** Stage both files.

---

### Task 3: Create-form payload reader

**Files:**
- Create: `web/src/routes/(app)/sales/new/read-payload.ts`
- Test: `web/src/routes/(app)/sales/new/read-payload.spec.ts`

**Interfaces:**
- Consumes: `parseAllocationsFromForm(form: FormData): SaleAllocation[]` from `$lib/sale-allocations` (use a relative-safe alias import as the sibling `[saleId]/read-payload.ts` does).
- Produces:
  - `export type CreateStatus = 'PENDING' | 'SOLD' | 'GIFTED';`
  - `export type CreateSaleInput = { matchId: string; allocations: SaleAllocation[]; status: CreateStatus; listedPrice?: number; recipientName?: string; invest?: number };` posted as-is to `POST /sales`.
  - `readCreatePayload(form: FormData): { input?: CreateSaleInput; error?: string }`

Rules (error strings are user copy, reuse the existing ones where they exist): missing match `Match is required.`; no allocations `Pick at least one pass and how many tickets it contributes.`; status field other than PENDING/SOLD/GIFTED defaults to PENDING; GIFTED requires non-blank `recipientName` else `Recipient is required.`; for GIFTED `listedPrice` is omitted from the payload regardless of the form; otherwise price must be finite and >= 1 else `Listed price must be at least 1.`; invest optional, finite and >= 0 else `Invest must be 0 or more.`; empty invest is omitted. Recipient name is trimmed and present only for GIFTED.

- [ ] **Step 1: Write the failing test.** Helper `buildForm(fields: Record<string, string>): FormData`. Describes: "when the match is missing", "when no tickets are allocated", "when the status is PENDING" (valid payload, invest omitted when empty, price below 1 errors, negative invest errors), "when the status is SOLD" (status carried, recipient null), "when the status is GIFTED" (blank recipient errors; valid has trimmed name and no `listedPrice` key; hidden invalid price is ignored; invest still passed through), "when the status field is unknown" (falls back to PENDING). One `it` per outcome, with real `expect` assertions on `error` and `input`.

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run "src/routes/(app)/sales/new/read-payload.spec.ts"`

- [ ] **Step 3: Implement**

```ts
import { parseAllocationsFromForm } from '$lib/sale-allocations';
import type { SaleAllocation } from '$lib/types';

export type CreateStatus = 'PENDING' | 'SOLD' | 'GIFTED';

export type CreateSaleInput = {
    matchId: string;
    allocations: SaleAllocation[];
    status: CreateStatus;
    listedPrice?: number;
    recipientName?: string;
    invest?: number;
};

function readStatus(raw: FormDataEntryValue | null): CreateStatus {
    return raw === 'SOLD' || raw === 'GIFTED' ? raw : 'PENDING';
}

export function readCreatePayload(form: FormData): {
    input?: CreateSaleInput;
    error?: string;
} {
    const matchId = form.get('matchId');
    const allocations = parseAllocationsFromForm(form);
    const status = readStatus(form.get('status'));
    const recipientRaw = form.get('recipientName');
    const recipientName = typeof recipientRaw === 'string' ? recipientRaw.trim() : '';
    const investRaw = form.get('invest');
    const invest =
        typeof investRaw === 'string' && investRaw !== '' ? Number(investRaw) : undefined;

    if (typeof matchId !== 'string' || matchId.length === 0) {
        return { error: 'Match is required.' };
    }

    if (allocations.length === 0) {
        return { error: 'Pick at least one pass and how many tickets it contributes.' };
    }

    if (status === 'GIFTED' && recipientName === '') {
        return { error: 'Recipient is required.' };
    }

    const listedPrice = status === 'GIFTED' ? undefined : Number(form.get('listedPrice'));

    if (listedPrice !== undefined && (!Number.isFinite(listedPrice) || listedPrice < 1)) {
        return { error: 'Listed price must be at least 1.' };
    }

    if (invest !== undefined && (!Number.isFinite(invest) || invest < 0)) {
        return { error: 'Invest must be 0 or more.' };
    }

    return {
        input: {
            matchId,
            allocations,
            status,
            ...(listedPrice !== undefined ? { listedPrice } : {}),
            ...(status === 'GIFTED' ? { recipientName } : {}),
            ...(invest !== undefined ? { invest } : {}),
        },
    };
}
```

- [ ] **Step 4: Run, expect PASS.** Stage both files.

---

### Task 4: Server load and create action

**Files:**
- Modify: `web/src/routes/(app)/sales/new/+page.server.ts` (whole file, 78 lines today)

**Interfaces:**
- Consumes: `readCreatePayload`, `CreateSaleInput` (Task 3); `homeMatchCount` from `$lib/accounting-view`; `CommissionResponse` from `$lib/types`; `api` from `$lib/api`.
- Produces: load data `{ matches, presetMatchId, passes, commissionPercent: number | null, homeFixtures: number, recipients: RecipientListItem[] }`. The action returns `fail(400, { message })` on any error; there is no partial-failure result.

- [ ] **Step 1: Load.** Fetch `/matches/current-season`, `/season-passes`, plus `Promise.allSettled` for `/sales/commission` and `/recipients` (a failure yields `null` and `[]`, never throws, mirroring `sales/+page.server.ts`). `homeFixtures = homeMatchCount(allMatches)` (whole-season list, before the `splitByKickoff` filter). Keep the existing `matches: upcoming` and the comment about kickoff.

- [ ] **Step 2: Action.**

```ts
export const actions: Actions = {
    default: async (event) => {
        const form = await event.request.formData();
        const { input, error } = readCreatePayload(form);

        if (error || !input) {
            return fail(400, { message: error ?? 'Invalid form.' });
        }

        try {
            await api<{ id: string }>(event, '/sales', { method: 'POST', json: input });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create sale.';

            return fail(400, { message });
        }

        throw redirect(303, '/sales');
    },
};
```

- [ ] **Step 3:** `npm run check` in `web/`; expect no errors. Stage.

---

### Task 5: Outcome card component

**Files:**
- Create: `web/src/lib/ui/SaleOutcomeCard.svelte`

**Interfaces:**
- Consumes: `SaleProfitBlock` (props `listedPrice: number | null; invest: number | null; commissionPercent: number; heading?: string`), `saleOutcomeNote` (Task 1), `SaleStatus`.
- Produces: component props `{ status: SaleStatus; listedPrice: number | null; invest: number | null; commissionPercent: number; recipientName: string }`.

- [ ] **Step 1: Implement.**
  - `note = $derived(saleOutcomeNote(status, recipientName))`.
  - Tone map as a module-level `const TONE_CLASS: Record<OutcomeTone, string>` using existing tokens: `warning` is `text-warning-strong border-warning/40 bg-warning/10`, `sunk` is `text-sunk-strong border-sunk/40 bg-sunk/10`, `gift` is `text-gift-strong border-gift/40 bg-gift/10`.
  - If `status` is `PENDING` or `SOLD`: render `<SaleProfitBlock {listedPrice} {invest} {commissionPercent} />`; when `note` is not null render beneath it a `<p>` pill with `TONE_CLASS[note.tone]` and `note.label`.
  - Else (GIFTED, CANCELLED): render a `<section aria-label="Net on this sale">` with the same `rounded-lg border p-4` shell as the block, tone classes, the heading "Net on this sale" in the block's heading style, and `note.label` as text. No numbers.
  - Wrap the root in `aria-live="polite"` is NOT wanted (it would announce every keystroke); leave it out.

- [ ] **Step 2:** `npm run check`; expect clean. Stage.

---

### Task 6: Status-aware page

**Files:**
- Modify: `web/src/routes/(app)/sales/new/+page.svelte`

**Interfaces:**
- Consumes: Tasks 1 to 5; `parseAmount` and `computeDraftBreakdown` indirectly via the card; `money` from `$lib/format`; `passesForMatch`; existing `selectedMatch`, `visiblePasses`, `selectedSeasonLabel` deriveds (keep as is).
- Produces: the form posts `matchId`, `status`, `listedPrice`, `invest`, `recipientName`, `alloc_<passId>`.

- [ ] **Step 1: State.** Add to the script:

```ts
type CreateStatus = 'PENDING' | 'SOLD' | 'GIFTED';

const STATUS_OPTIONS: { value: CreateStatus; label: string; tone: string }[] = [
    { value: 'PENDING', label: 'Pending', tone: 'peer-checked:bg-warning/15 peer-checked:text-warning-strong peer-checked:border-warning/50' },
    { value: 'SOLD', label: 'Sold', tone: 'peer-checked:bg-positive/15 peer-checked:text-positive-strong peer-checked:border-positive/50' },
    { value: 'GIFTED', label: 'Gifted', tone: 'peer-checked:bg-gift/15 peer-checked:text-gift-strong peer-checked:border-gift/50' },
];

let status = $state<CreateStatus>('PENDING');
let listedPrice = $state('');
let investInput = $state('');
let investTouched = $state(false);
let recipientName = $state('');
let ticketsByPassId = $state<Record<string, number>>({});

let suggestion = $derived(
    suggestedInvest({ passes: visiblePasses, ticketsByPassId, homeFixtures: data.homeFixtures }),
);

$effect(() => {
    if (!investTouched) {
        investInput = suggestion === null ? '' : String(suggestion.amount);
    }
});

$effect(() => {
    selectedMatchId;
    ticketsByPassId = {};
});
```

  Copy the `STATUS_OPTIONS` tone strings from `sales/+page.svelte` (lines 128 to 156) so both screens match. The second `$effect` resets ticket counts when the match changes (passes differ per season); fold it into the existing preset `$effect` if simpler. Import `suggestedInvest`, `money`, `parseAmount`, `SaleOutcomeCard`. The existing `$effect` that re-seeds `selectedMatchId` stays.

- [ ] **Step 2: Markup.**
  - Widen the form container from `max-w-lg` to `max-w-2xl` only if the card needs it; otherwise keep `max-w-lg`.
  - Status control after the pass fieldset: a `fieldset` with legend "Status" and three `<label>` segments, each with a visually-hidden `peer` radio `name="status"` bound via `bind:group={status}`, styled like the drawer's.
  - Pass inputs: replace `value="0"` with `value={ticketsByPassId[pass.id] ?? 0}` and `oninput={(event) => (ticketsByPassId[pass.id] = Number(event.currentTarget.value))}`. Keep `name={`alloc_${pass.id}`}`.
  - Wrap listed price and invest labels in `{#if status !== 'GIFTED'} ... {/if}`. Bind price: `bind:value={listedPrice}`. Invest: `value={investInput}` with `oninput={(event) => { investTouched = true; investInput = event.currentTarget.value; }}` and `aria-describedby="invest-hint"`. Keep the label text `Listed price (€)`.
  - For `GIFTED` also render a hidden `<input type="hidden" name="invest" value={investInput}>` so the unshown cost is still submitted; the visible invest input is rendered only when not gifted, so there is no duplicate `name`.
  - Hint under invest: `{#if suggestion}<p id="invest-hint" class="text-xs text-ink-faint">Pass cost per home match: {money(suggestion.costPerTicket)} × {suggestion.tickets} ticket{suggestion.tickets === 1 ? '' : 's'}</p>{/if}`.
  - Sold date: `{#if status === 'SOLD'}` a read-only block copied from `sales/+page.svelte` lines 668 to 681 with the text "Set when you save".
  - Recipient: `{#if status === 'GIFTED'}` a labelled text input `name="recipientName"`, `list="recipient-options"`, `required`, `maxlength="120"`, `autocomplete="off"`, `bind:value={recipientName}`, plus `<datalist id="recipient-options">` over `data.recipients`.
  - Preview: before the error message, `{#if data.commissionPercent !== null}<SaleOutcomeCard {status} listedPrice={parseAmount(listedPrice)} invest={parseAmount(investInput)} commissionPercent={data.commissionPercent} {recipientName} />{/if}`.
  - Disable submit logic unchanged.

- [ ] **Step 3:** `npm run check`, then lint, then `npx vitest run` in `web/`. Expect all green. Run the app and look at the page for each status: Pending shows the amber note under the block; Sold shows the sold-date field; Gifted hides price and invest and shows the teal card with the typed name; typing a price updates the net; picking tickets prefills invest and typing in invest stops the prefill. Report anything not verified.

- [ ] **Step 4:** Stage.

---

### Task 7: e2e coverage

**Files:**
- Modify: `e2e/tests/sale.e2e-spec.ts` (already listed in `e2e/playwright.config.ts` `testMatch`; confirm with grep and do not add a new spec file)

- [ ] **Step 1:** Add three tests using distinct prices (follow the file's note that scenarios run in parallel; use `503`, `504` and a gifted case with no price):
  1. Preview: go to `/sales/new`, select the seeded match, set 1 ticket, fill `Listed price (€)` with `503`, fill the invest field with `0`; expect `getByTestId('profit-net')` to contain the formatted `503 × 0.88` net (build the expected string with the same format the page uses; read an existing assertion in the file for the helper or use a regex on `442,64`).
  2. Gifted form: check the `Gifted` radio with `{ force: true }`; expect `Listed price (€)` not visible and the recipient input required; fill `E2E Recipient`; expect the card to contain `Gifted to E2E Recipient, no cash`; submit; expect `GIFTED` in the ledger row. Delete the sale at the end as the existing gifted test does.
  3. Sold: check `Sold`, fill price `504`, submit, expect a row containing `SOLD`; delete at the end.
- [ ] **Step 2:** Run `npx playwright test sale` per the repo's e2e instructions. If the e2e stack cannot run in this environment, say so explicitly in the handoff instead of claiming it passed.
- [ ] **Step 3:** Stage.

---

### Task 8: Record the deferred items

**Files:**
- Modify: `docs/tech-debt.md` (append entries in the existing format: what, why deferred, cost to act)

- [ ] **Step 1:** Add one entry:
  - "Two new-sale surfaces (PSG-90)": inline panel in `sales/+page.svelte` (`newSalePanel`) has no preview or status controls. Deferred to keep the PR in one layer and small. Acting costs removing the panel and pointing "New sale" at `/sales/new`, or extracting the form into a component both mount.
- [ ] **Step 2:** Tell the coordinator to file it as a `PSG-*` Linear issue (assigned to the user) before saying the work is ready for `/crit`. Stage and stop.

---

## Self-review

- Spec coverage: 4.1 status control (Task 6), 4.2 preview (Tasks 5, 6), 4.3 copy helper (Task 1), 4.4 invest prefill and hint (Tasks 2, 4, 6), 4.5 one-call submit (Tasks 3, 4), 4.6 files (all), testing (Tasks 1 to 3, 7), out-of-scope debt (Task 8).
- Names used consistently: `saleOutcomeNote`, `suggestedInvest`, `readCreatePayload`, `SaleOutcomeCard`, `homeFixtures`, `commissionPercent`.
- Known soft spots for the reviewer: Task 3's spec body is described by scenario list rather than full code, and Task 6 gives structure plus snippets rather than the whole file; both follow patterns in the named sibling files.
