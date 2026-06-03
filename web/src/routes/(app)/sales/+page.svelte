<script lang="ts">
    import type { PageData } from './$types';
    import { money, signedMoney } from '$lib/format';

    let { data }: { data: PageData } = $props();

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

    type SortKey = 'nbTickets' | 'listedPrice' | 'invest' | 'profit';
    type SortDir = 'asc' | 'desc';

    const SORT_LABELS: Record<SortKey, string> = {
        nbTickets: 'Tickets',
        listedPrice: 'Price',
        invest: 'Invest',
        profit: 'Profit',
    };

    let sortKey = $state<SortKey | null>(null);
    let sortDir = $state<SortDir>('desc');

    function toggleSort(key: SortKey): void {
        if (sortKey === key) {
            sortDir = sortDir === 'desc' ? 'asc' : 'desc';

            return;
        }

        sortKey = key;
        sortDir = 'desc';
    }

    function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
        if (sortKey !== key) {
            return 'none';
        }

        return sortDir === 'asc' ? 'ascending' : 'descending';
    }

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

    function arrow(key: SortKey): string {
        if (sortKey !== key) {
            return '';
        }

        return sortDir === 'asc' ? '↑' : '↓';
    }

    function statusPill(status: 'SOLD' | 'PENDING' | 'CANCELLED'): string {
        switch (status) {
            case 'SOLD':
                return 'bg-positive/15 text-positive-strong';
            case 'PENDING':
                return 'bg-warning/15 text-warning-strong';
            case 'CANCELLED':
                return 'bg-surface-strong text-ink-muted';
        }
    }

    function onMobileSortChange(event: Event): void {
        const value = (event.currentTarget as HTMLSelectElement).value;

        sortKey = value === '' ? null : (value as SortKey);
    }
</script>

<div class="flex flex-wrap items-center justify-between gap-3 mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Sales</h1>

    <div class="flex items-center gap-3">
        <form method="GET" class="flex items-center gap-2">
            <label class="text-sm text-ink-muted" for="year">Season</label>
            <select
                id="year"
                name="year"
                class="rounded border border-line-strong bg-surface text-ink-muted px-2 py-1 text-sm hover:text-ink hover:border-ink transition-colors"
                onchange={(event) => event.currentTarget.form?.requestSubmit()}
            >
                <option value="">Current</option>
                {#each years as year (year)}
                    <option value={year} selected={data.year === year}>{year}</option>
                {/each}
            </select>
        </form>

        <a
            href="/sales/new"
            class="rounded bg-primary text-surface px-3 py-1.5 text-sm font-medium hover:bg-primary-hover transition-colors"
        >
            + New sale
        </a>
    </div>
</div>

{#if data.sales.length === 0}
    <p class="text-ink-faint text-sm">No sales in this season.</p>
{:else}
    <!-- Mobile sort bar -->
    <div class="flex items-center gap-2 mb-3 text-sm sm:hidden">
        <label for="sales-sort" class="text-ink-muted">Sort by</label>
        <select
            id="sales-sort"
            value={sortKey ?? ''}
            onchange={onMobileSortChange}
            class="rounded border border-line-strong bg-surface text-ink px-2 py-1.5"
        >
            <option value="">Default</option>
            {#each Object.entries(SORT_LABELS) as [key, label] (key)}
                <option value={key}>{label}</option>
            {/each}
        </select>
        {#if sortKey !== null}
            <button
                type="button"
                onclick={() => (sortDir = sortDir === 'desc' ? 'asc' : 'desc')}
                class="rounded border border-line-strong bg-surface text-ink-muted hover:text-ink hover:border-ink px-2 py-1.5 transition-colors font-mono"
                aria-label="Toggle sort direction"
            >
                {sortDir === 'desc' ? '↓' : '↑'}
            </button>
        {/if}
    </div>

    <!-- Mobile card list -->
    <ul class="grid gap-3 sm:hidden">
        {#each sortedSales as sale (sale.id)}
            <li>
                <a
                    href="/sales/{sale.id}"
                    class="block bg-surface rounded-lg border border-line p-4 hover:border-line-strong transition-colors"
                >
                    <header class="flex items-baseline justify-between gap-3 mb-2">
                        <span class="font-medium text-ink truncate">{sale.opponent.name}</span>
                        <span
                            class="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium {statusPill(
                                sale.status,
                            )}"
                        >
                            {sale.status}
                        </span>
                    </header>
                    <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <dt class="text-ink-muted">Tickets</dt>
                        <dd class="text-right font-mono text-ink">{sale.nbTickets}</dd>

                        <dt class="text-ink-muted">Price</dt>
                        <dd class="text-right font-mono text-ink">
                            {money(sale.listedPrice)}
                        </dd>

                        <dt class="text-ink-muted">Invest</dt>
                        <dd class="text-right font-mono text-ink">
                            {money(sale.invest)}
                        </dd>

                        <dt class="text-ink-muted">Profit</dt>
                        <dd
                            class="text-right font-mono {sale.profit < 0
                                ? 'text-negative'
                                : 'text-positive'}"
                        >
                            {signedMoney(sale.profit)}
                        </dd>
                    </dl>
                </a>
            </li>
        {/each}
    </ul>

    <!-- Desktop / tablet table -->
    <div class="hidden sm:block bg-surface rounded-lg border border-line overflow-x-auto">
        <table class="w-full text-sm">
            <thead class="bg-surface-subtle text-ink-muted text-xs">
                <tr>
                    <th class="text-left px-4 py-2 font-medium">Opponent</th>
                    <th
                        class="text-right px-4 py-2 font-medium"
                        aria-sort={ariaSort('nbTickets')}
                    >
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 hover:text-ink transition-colors w-full justify-end"
                            onclick={() => toggleSort('nbTickets')}
                        >
                            Tickets
                            <span aria-hidden="true" class="font-mono w-3 text-ink">
                                {arrow('nbTickets')}
                            </span>
                        </button>
                    </th>
                    <th
                        class="text-right px-4 py-2 font-medium"
                        aria-sort={ariaSort('listedPrice')}
                    >
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 hover:text-ink transition-colors w-full justify-end"
                            onclick={() => toggleSort('listedPrice')}
                        >
                            Price
                            <span aria-hidden="true" class="font-mono w-3 text-ink">
                                {arrow('listedPrice')}
                            </span>
                        </button>
                    </th>
                    <th
                        class="text-right px-4 py-2 font-medium"
                        aria-sort={ariaSort('invest')}
                    >
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 hover:text-ink transition-colors w-full justify-end"
                            onclick={() => toggleSort('invest')}
                        >
                            Invest
                            <span aria-hidden="true" class="font-mono w-3 text-ink">
                                {arrow('invest')}
                            </span>
                        </button>
                    </th>
                    <th
                        class="text-right px-4 py-2 font-medium"
                        aria-sort={ariaSort('profit')}
                    >
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 hover:text-ink transition-colors w-full justify-end"
                            onclick={() => toggleSort('profit')}
                        >
                            Profit
                            <span aria-hidden="true" class="font-mono w-3 text-ink">
                                {arrow('profit')}
                            </span>
                        </button>
                    </th>
                    <th class="text-left px-4 py-2 font-medium">Status</th>
                    <th class="px-4 py-2"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-line">
                {#each sortedSales as sale (sale.id)}
                    <tr>
                        <td class="px-4 py-2 text-ink">{sale.opponent.name}</td>
                        <td class="px-4 py-2 text-right font-mono text-ink">
                            {sale.nbTickets}
                        </td>
                        <td class="px-4 py-2 text-right font-mono text-ink">
                            {money(sale.listedPrice)}
                        </td>
                        <td class="px-4 py-2 text-right font-mono text-ink">
                            {money(sale.invest)}
                        </td>
                        <td
                            class="px-4 py-2 text-right font-mono {sale.profit < 0
                                ? 'text-negative'
                                : 'text-positive'}"
                        >
                            {signedMoney(sale.profit)}
                        </td>
                        <td class="px-4 py-2">
                            <span
                                class="inline-block px-2 py-0.5 rounded text-xs font-medium {statusPill(
                                    sale.status,
                                )}"
                            >
                                {sale.status}
                            </span>
                        </td>
                        <td class="px-4 py-2 text-right">
                            <a
                                href="/sales/{sale.id}"
                                class="text-primary font-medium hover:text-primary-hover hover:underline"
                                >Edit</a
                            >
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
