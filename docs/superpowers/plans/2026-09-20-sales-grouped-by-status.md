# Sales Screen: Group Pending Sales Above Terminal-Status Sales

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the current-season sales screen, show all PENDING sales first (ordered by match date asc), then all terminal-status sales (SOLD/GIFTED/CANCELLED, also ordered by match date asc), separated by a section divider. Past-season views remain a flat list.

**Architecture:** A new `getSalesGrouped` method at each layer (DB → Service → Controller) returns `{ pending: Sale[]; terminal: Sale[] }`. The existing `getSales`/`getSalesByRange` stay untouched — they serve season/accounting consumers that need a flat list. The frontend page loader calls a new endpoint for the current season and renders two sections with dividers.

**Tech Stack:** NestJS, Prisma, Redis caching, SvelteKit (Svelte 5), TypeScript, Vitest

**Spec:** This plan implements PSG-21 (https://linear.app/psg-inventory/issue/PSG-21)

## Global Constraints

- Existing `getSales`/`getSalesByRange` methods must NOT be modified — they serve other consumers
- `SaleStatus` is `'PENDING' | 'SOLD' | 'CANCELLED' | 'GIFTED'`
- Terminal statuses: SOLD, GIFTED, CANCELLED
- All arrays ordered by `Match.date asc` internally
- Current season only — past seasons return flat `FormattedSale[]` as before
- Follow existing patterns: Redis caching, hexagonal architecture (db layer returns raw types, service formats)

## File Structure

| File | Change |
|------|--------|
| `src/db/sales/sales.db.interface.ts` | Add `SalesGroup` type + `getSalesGrouped` abstract method |
| `src/db/sales/type/sale.type.ts` | Add `SalesGroup` type |
| `src/db/sales/sales.db.ts` | Implement `getSalesGrouped` |
| `src/db/sales/sales.db.spec.ts` | Test `getSalesGrouped` |
| `src/api/sales/interfaces/sales.service.interface.ts` | Add `FormattedSalesGroup` type + `getSalesGrouped` abstract method |
| `src/api/sales/sales.service.ts` | Implement `getSalesGrouped` |
| `src/api/sales/sales.service.spec.ts` | Test `getSalesGrouped` |
| `src/api/sales/sales.controller.ts` | Add `GET /sales/grouped` endpoint |
| `web/src/lib/types.ts` | Add `SalesGroupListItem` type |
| `web/src/routes/(app)/sales/+page.server.ts` | Call `/sales/grouped` for current season |
| `web/src/routes/(app)/sales/+page.svelte` | Render pending/terminal sections with dividers |

---

### Task 1: Add `SalesGroup` type and `getSalesGrouped` to the DB interface

**Files:**
- Modify: `src/db/sales/type/sale.type.ts`
- Modify: `src/db/sales/sales.db.interface.ts`

**Interfaces:**
- Consumes: `Sale` type (already defined)
- Produces: `SalesGroup` type, `ISalesDbService.getSalesGrouped(userId): Promise<SalesGroup>`

- [ ] **Step 1: Add `SalesGroup` type to `src/db/sales/type/sale.type.ts`**

```typescript
// Add after the `Sale` type definition (after line 53)

export type SalesGroup = {
    pending: Sale[];
    terminal: Sale[];
};
```

- [ ] **Step 2: Add `getSalesGrouped` to `ISalesDbService` in `src/db/sales/sales.db.interface.ts`**

```typescript
// Add import at top
import { SalesGroup } from './type/sale.type';

// Add to the abstract class, after `getSalesByRange` (after line 26)
abstract getSalesGrouped(userId: UserId): Promise<SalesGroup>;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Error about missing implementation in `SalesDb` (expected — implementation is Task 2)

- [ ] **Step 4: Commit**

```bash
git add src/db/sales/type/sale.type.ts src/db/sales/sales.db.interface.ts
git commit -m "feat(sales): add SalesGroup type and getSalesGrouped to DB interface"
```

---

### Task 2: Implement `getSalesGrouped` in the DB layer

**Files:**
- Modify: `src/db/sales/sales.db.ts`
- Modify: `src/db/sales/sales.db.spec.ts`

**Interfaces:**
- Consumes: `SalesGroup` type, `SaleStatus` from Prisma
- Produces: `SalesDb.getSalesGrouped(userId)` — returns `{ pending: Sale[]; terminal: Sale[] }`

- [ ] **Step 1: Write the failing test in `src/db/sales/sales.db.spec.ts`**

Add a new `describe('getSalesGrouped')` block. The test should:
1. Mock `redisService.get` to return a flat array of sales with mixed statuses
2. Call `service.getSalesGrouped(userId)`
3. Assert the result has `pending` and `terminal` arrays
4. Assert `pending` contains only PENDING sales, ordered by match date asc
5. Assert `terminal` contains SOLD/GIFTED/CANCELLED sales, ordered by match date asc

```typescript
describe('getSalesGrouped', () => {
    it('splits sales into pending and terminal groups ordered by match date', async () => {
        const pendingSale1 = saleFixture(new Date('2026-09-01'), SaleStatus.PENDING);
        const pendingSale2 = saleFixture(new Date('2026-08-01'), SaleStatus.PENDING);
        const soldSale = saleFixture(new Date('2026-07-01'), SaleStatus.SOLD);
        const giftedSale = saleFixture(new Date('2026-06-01'), SaleStatus.GIFTED);
        const cancelledSale = saleFixture(new Date('2026-05-01'), SaleStatus.CANCELLED);

        // Override IDs to be unique
        (pendingSale2 as { id: SaleId }).id = 'sale-2' as SaleId;
        (soldSale as { id: SaleId }).id = 'sale-3' as SaleId;
        (giftedSale as { id: SaleId }).id = 'sale-4' as SaleId;
        (cancelledSale as { id: SaleId }).id = 'sale-5' as SaleId;

        const allSales = [pendingSale1, soldSale, pendingSale2, giftedSale, cancelledSale];

        // Mock the redisService.get to return the flat array
        (prismaService.sales.findMany as Mock).mockResolvedValue(allSales as never);

        const result = await service.getSalesGrouped(userId);

        expect(result.pending).toHaveLength(2);
        expect(result.pending[0].id).toBe('sale-2'); // Aug 1 before Sep 1
        expect(result.pending[1].id).toBe(saleId);    // Sep 1

        expect(result.terminal).toHaveLength(3);
        expect(result.terminal[0].id).toBe('sale-5'); // May 1 (cancelled)
        expect(result.terminal[1].id).toBe('sale-4'); // Jun 1 (gifted)
        expect(result.terminal[2].id).toBe('sale-3'); // Jul 1 (sold)
    });

    it('returns empty arrays when no sales exist', async () => {
        (prismaService.sales.findMany as Mock).mockResolvedValue([] as never);

        const result = await service.getSalesGrouped(userId);

        expect(result.pending).toHaveLength(0);
        expect(result.terminal).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/sales/sales.db.spec.ts`
Expected: FAIL — `getSalesGrouped` is not a function (not implemented yet)

- [ ] **Step 3: Implement `getSalesGrouped` in `src/db/sales/sales.db.ts`**

```typescript
// Add import for SalesGroup at the top
import { Sale, SalesGroup } from './type/sale.type';

// Add method to the SalesDb class (after getSalesByRange, after line 108)
async getSalesGrouped(userId: UserId): Promise<SalesGroup> {
    const sales = await this.getSales(userId);

    const pending: Sale[] = [];
    const terminal: Sale[] = [];

    for (const sale of sales) {
        if (sale.status === 'PENDING') {
            pending.push(sale);
        } else {
            terminal.push(sale);
        }
    }

    return { pending, terminal };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/sales/sales.db.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/sales/sales.db.ts src/db/sales/sales.db.spec.ts
git commit -m "feat(sales): implement getSalesGrouped in DB layer"
```

---

### Task 3: Add `getSalesGrouped` to the service layer

**Files:**
- Modify: `src/api/sales/interfaces/sales.service.interface.ts`
- Modify: `src/api/sales/sales.service.ts`
- Modify: `src/api/sales/sales.service.spec.ts`

**Interfaces:**
- Consumes: `ISalesDbService.getSalesGrouped(userId)` (from Task 2)
- Produces: `ISalesService.getSalesGrouped(userId): Promise<FormattedSalesGroup>`

- [ ] **Step 1: Add `FormattedSalesGroup` type and abstract method to `src/api/sales/interfaces/sales.service.interface.ts`**

```typescript
// Add after the FormattedSale type (after line 13)
export type FormattedSalesGroup = {
    pending: FormattedSale[];
    terminal: FormattedSale[];
};

// Add to the ISalesService abstract class (after getCurrentSeasonSales, after line 18)
abstract getSalesGrouped(userId: UserId): Promise<FormattedSalesGroup>;
```

- [ ] **Step 2: Write the failing test in `src/api/sales/sales.service.spec.ts`**

```typescript
describe('getSalesGrouped', () => {
    it('returns formatted pending and terminal groups', async () => {
        const pendingSale = saleFixture(new Date('2026-09-01'), SaleStatus.PENDING);
        const soldSale = saleFixture(new Date('2026-07-01'), SaleStatus.SOLD);

        salesDbService.getSalesGrouped.mockResolvedValue({
            pending: [pendingSale],
            terminal: [soldSale],
        });

        const result = await service.getSalesGrouped(userId);

        expect(result.pending).toHaveLength(1);
        expect(result.pending[0]).toMatchObject({
            opponent: { id: 'opp', name: 'Marseille' },
            matchDate: new Date('2026-09-01'),
            status: 'PENDING',
        });
        expect(result.pending[0]).not.toHaveProperty('Match');

        expect(result.terminal).toHaveLength(1);
        expect(result.terminal[0]).toMatchObject({
            status: 'SOLD',
        });
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/api/sales/sales.service.spec.ts`
Expected: FAIL — `getSalesGrouped` is not implemented

- [ ] **Step 4: Implement `getSalesGrouped` in `src/api/sales/sales.service.ts`**

```typescript
// Add import for FormattedSalesGroup at the top
import { FormattedSale, FormattedSalesGroup, ISalesService } from './interfaces/sales.service.interface';

// Add method to the SalesService class (after getCurrentSeasonSales, after line 66)
async getSalesGrouped(userId: UserId): Promise<FormattedSalesGroup> {
    const group = await this.salesDbService.getSalesGrouped(userId);

    return {
        pending: group.pending.map((sale) => this.formatSale(sale)),
        terminal: group.terminal.map((sale) => this.formatSale(sale)),
    };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/api/sales/sales.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/sales/interfaces/sales.service.interface.ts src/api/sales/sales.service.ts src/api/sales/sales.service.spec.ts
git commit -m "feat(sales): add getSalesGrouped to service layer"
```

---

### Task 4: Add `GET /sales/grouped` controller endpoint

**Files:**
- Modify: `src/api/sales/sales.controller.ts`

**Interfaces:**
- Consumes: `ISalesService.getSalesGrouped(userId)` (from Task 3)
- Produces: `GET /sales/grouped` → `FormattedSalesGroup`

- [ ] **Step 1: Add the endpoint to `src/api/sales/sales.controller.ts`**

```typescript
// Add import for FormattedSalesGroup
import { FormattedSale, FormattedSalesGroup, ISalesService } from './interfaces/sales.service.interface';

// Add method to the SalesController class (after getCurrentSeasonSales, after line 22)
@Get('/grouped')
async getSalesGrouped(
    @User() user: AuthenticatedUser,
): Promise<FormattedSalesGroup> {
    return await this.salesService.getSalesGrouped(user.id);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

- [ ] **Step 3: Run all backend tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/api/sales/sales.controller.ts
git commit -m "feat(sales): add GET /sales/grouped endpoint"
```

---

### Task 5: Update frontend types and page loader

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/routes/(app)/sales/+page.server.ts`

**Interfaces:**
- Consumes: `GET /sales/grouped` → `{ pending: SaleListItem[]; terminal: SaleListItem[] }`
- Produces: `SalesGroupListItem` type, `data.salesGroup` in page data

- [ ] **Step 1: Add `SalesGroupListItem` type to `web/src/lib/types.ts`**

```typescript
// Add after the SaleListItem type (after line 97)
export type SalesGroupListItem = {
    pending: SaleListItem[];
    terminal: SaleListItem[];
};
```

- [ ] **Step 2: Update the page loader in `web/src/routes/(app)/sales/+page.server.ts`**

Replace the current sales fetch logic (lines 22-25) with:

```typescript
const isCurrentSeason = seasonYear === null;
const salesPath = seasonYear !== null ? `/sales/season/${seasonYear}` : '/sales/current-season';

let sales: SaleListItem[];
let salesGroup: SalesGroupListItem | null = null;

if (isCurrentSeason) {
    const grouped = await api<SalesGroupListItem>(event, '/sales/grouped');
    sales = [...grouped.pending, ...grouped.terminal];
    salesGroup = grouped;
} else {
    sales = await api<SaleListItem[]>(event, salesPath);
}
```

Update the return statement (line 75) to include `salesGroup`:

```typescript
return {
    sales,
    salesGroup,
    year: seasonYear,
    editSale,
    matches,
    isNew,
    passes,
    recipients,
    canCreate,
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd web && npx svelte-check`
Expected: PASS (no type errors, though there will be a warning about `salesGroup` unused until Task 6)

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/types.ts web/src/routes/(app)/sales/+page.server.ts
git commit -m "feat(sales): add SalesGroupListItem type and grouped page loader"
```

---

### Task 6: Render pending/terminal sections in the sales list UI

**Files:**
- Modify: `web/src/routes/(app)/sales/+page.svelte`

**Interfaces:**
- Consumes: `data.salesGroup` (from Task 5)
- Produces: Two sections with dividers in the rendered sales list

- [ ] **Step 1: Update the `sortedSales` derivation to support grouped mode**

Replace the current `sortedSales` derivation (lines 100-111) with logic that handles both grouped and flat modes:

```typescript
// Replace the sortedSales derivation
let sortedSales = $derived.by(() => {
    if (sortKey === null) {
        return data.sales;
    }

    const key = sortKey;
    const factor = sortDir === 'asc' ? 1 : -1;

    return [...data.sales].sort((firstSale, secondSale) => {
        return (firstSale[key] - secondSale[key]) * factor;
    });
});

// Add grouped derivations for the current season
let pendingSales = $derived(
    data.salesGroup
        ? sortKey === null
            ? data.salesGroup.pending
            : [...data.salesGroup.pending].sort((a, b) => (a[sortKey!] - b[sortKey!]) * (sortDir === 'asc' ? 1 : -1))
        : null,
);

let terminalSales = $derived(
    data.salesGroup
        ? sortKey === null
            ? data.salesGroup.terminal
            : [...data.salesGroup.terminal].sort((a, b) => (a[sortKey!] - b[sortKey!]) * (sortDir === 'asc' ? 1 : -1))
        : null,
);
```

- [ ] **Step 2: Add a section divider snippet**

Add this snippet after the existing helper functions (before the template):

```typescript
function sectionLabel(count: number, label: string): string {
    return `${count} ${label}${count !== 1 ? 's' : ''}`;
}
```

- [ ] **Step 3: Update the mobile card list rendering**

Replace the mobile `{#each sortedSales as sale}` block (lines 987-1048) with grouped-aware rendering:

```svelte
<!-- Mobile card list -->
{#if pendingSales !== null && terminalSales !== null}
    {#if pendingSales.length > 0}
        <div class="sm:hidden">
            <h3 class="text-xs font-medium text-ink-muted uppercase tracking-wide px-1 mb-2">
                Pending — {sectionLabel(pendingSales.length, 'sale')}
            </h3>
            <ul class="grid gap-3">
                {#each pendingSales as sale (sale.id)}
                    <!-- ... existing card markup ... -->
                {/each}
            </ul>
        </div>
    {/if}
    {#if terminalSales.length > 0}
        <div class="sm:hidden mt-6">
            <h3 class="text-xs font-medium text-ink-muted uppercase tracking-wide px-1 mb-2">
                Completed — {sectionLabel(terminalSales.length, 'sale')}
            </h3>
            <ul class="grid gap-3">
                {#each terminalSales as sale (sale.id)}
                    <!-- ... existing card markup ... -->
                {/each}
            </ul>
        </div>
    {/if}
{:else}
    <ul class="grid gap-3 sm:hidden">
        {#each sortedSales as sale (sale.id)}
            <!-- ... existing card markup ... -->
        {/each}
    </ul>
{/if}
```

- [ ] **Step 4: Update the desktop table rendering**

Replace the desktop `{#each sortedSales as sale}` block (lines 1120-1167) with grouped-aware rendering:

```svelte
<!-- Desktop / tablet table -->
<div class="hidden sm:block bg-surface rounded-lg border border-line overflow-x-auto">
    <table class="w-full text-sm">
        <thead class="bg-surface-subtle text-ink-muted text-xs">
            <!-- ... existing header row ... -->
        </thead>
        <tbody class="divide-y divide-line">
            {#if pendingSales !== null && terminalSales !== null}
                {#if pendingSales.length > 0}
                    <tr>
                        <td colspan="7" class="px-4 py-2 text-xs font-medium text-ink-muted uppercase tracking-wide bg-surface-subtle">
                            Pending — {sectionLabel(pendingSales.length, 'sale')}
                        </td>
                    </tr>
                    {#each pendingSales as sale (sale.id)}
                        <!-- ... existing row markup ... -->
                    {/each}
                {/if}
                {#if terminalSales.length > 0}
                    <tr>
                        <td colspan="7" class="px-4 py-2 text-xs font-medium text-ink-muted uppercase tracking-wide bg-surface-subtle">
                            Completed — {sectionLabel(terminalSales.length, 'sale')}
                        </td>
                    </tr>
                    {#each terminalSales as sale (sale.id)}
                        <!-- ... existing row markup ... -->
                    {/each}
                {/if}
            {:else}
                {#each sortedSales as sale (sale.id)}
                    <!-- ... existing row markup ... -->
                {/each}
            {/if}
        </tbody>
    </table>
</div>
```

- [ ] **Step 5: Visual verification**

Start the dev server and navigate to the sales screen:
1. Current season view: verify pending sales appear in first section, terminal in second
2. Past season view (select a previous year): verify flat list with no sections
3. Column sort: verify sorting works independently within each section
4. Edit drawer: verify it still opens correctly within sections

- [ ] **Step 6: Commit**

```bash
git add web/src/routes/(app)/sales/+page.svelte
git commit -m "feat(sales): render pending/terminal sections with dividers on current season"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full backend test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run frontend type check**

Run: `cd web && npx svelte-check`
Expected: No errors

- [ ] **Step 3: Run linting**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

Start dev server (`npm run dev` or equivalent) and verify:
1. Current season: pending sales grouped at top, terminal at bottom, divider visible
2. Past season: flat list, no dividers
3. Column sort works within each group
4. Edit/delete still works from within grouped sections
5. New sale creation still works and redirects correctly

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(sales): address review feedback on grouped sales"
```
