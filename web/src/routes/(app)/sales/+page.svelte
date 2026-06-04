<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { tick } from 'svelte';
    import { dateTime, money, signedMoney } from '$lib/format';
    import Spinner from '$lib/ui/Spinner.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();

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
                return 'bg-sunk/15 text-sunk-strong';
        }
    }

    function profitTone(
        status: 'SOLD' | 'PENDING' | 'CANCELLED',
        profit: number,
    ): string {
        if (status === 'CANCELLED') {
            return 'text-sunk';
        }

        if (status === 'PENDING') {
            return 'text-warning';
        }

        if (profit < 0) {
            return 'text-negative';
        }

        if (profit > 0) {
            return 'text-positive';
        }

        return 'text-ink';
    }

    function onMobileSortChange(event: Event): void {
        const value = (event.currentTarget as HTMLSelectElement).value;

        sortKey = value === '' ? null : (value as SortKey);
    }

    // URL-driven expand state. `?edit={saleId}` opens the inline form for that row.
    let editId = $derived(page.url.searchParams.get('edit'));
    let editSale = $derived(data.editSale);
    let editMatchDate = $derived(editSale ? new Date(editSale.Match.date) : null);
    let isPastMatch = $derived(
        editMatchDate ? editMatchDate.getTime() < Date.now() : false,
    );

    function urlWithEdit(targetId: string | null): string {
        const params = new URLSearchParams(page.url.searchParams);

        if (targetId) {
            params.set('edit', targetId);
        } else {
            params.delete('edit');
        }

        const qs = params.toString();

        return qs ? `/sales?${qs}` : '/sales';
    }

    let submitting = $state<'update' | 'delete' | 'flip' | null>(null);

    let firstFieldEl = $state<HTMLInputElement | null>(null);

    // When ?edit={id} resolves to a real editSale, move keyboard focus to the
    // first input so Sam (screen reader) and Alex (keyboard) land in the form
    // instead of on the now-stale trigger link. Awaiting tick() ensures the
    // panel is mounted before we attempt focus.
    $effect(() => {
        if (editId && editSale && editSale.id === editId) {
            void tick().then(() => {
                firstFieldEl?.focus();
                firstFieldEl?.select();
            });
        }
    });

    function onWindowKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Escape') {
            return;
        }

        if (!editId) {
            return;
        }

        // Don't fight native confirm() dialogs; if anything is in flight, skip.
        if (submitting !== null) {
            return;
        }

        event.preventDefault();
        void goto(urlWithEdit(null), { keepFocus: false, noScroll: true });
    }

    function trackSubmit({ action, cancel }: { action: URL; cancel: () => void }) {
        const which: 'update' | 'delete' = action.search.includes('delete')
            ? 'delete'
            : 'update';

        if (submitting !== null) {
            cancel();

            return;
        }

        submitting = which;

        return async ({ update }: { update: () => Promise<void> }) => {
            await update();
            submitting = null;
        };
    }

    function trackFlip({ cancel }: { cancel: () => void }) {
        if (submitting !== null) {
            cancel();

            return;
        }

        submitting = 'flip';

        return async ({ update }: { update: () => Promise<void> }) => {
            await update();
            submitting = null;
        };
    }

    function confirmIfPast(event: Event, action: 'save' | 'delete'): void {
        if (!editSale || !isPastMatch || !editMatchDate) {
            return;
        }

        const opponent = editSale.Match.Opponent.name;
        const verb = action === 'save' ? 'Save changes to' : 'Delete';
        const ok = confirm(
            `${verb} the ${opponent} sale? The match was on ${dateTime(editMatchDate)}; this rewrites historical numbers.`,
        );

        if (!ok) {
            event.preventDefault();
        }
    }

    function confirmDelete(event: Event): void {
        if (!editSale) {
            return;
        }

        if (isPastMatch) {
            confirmIfPast(event, 'delete');

            return;
        }

        const opponent = editSale.Match.Opponent.name;

        if (!confirm(`Delete the ${opponent} sale?`)) {
            event.preventDefault();
        }
    }

    function confirmMarkSold(event: Event): void {
        if (!editSale || !isPastMatch || !editMatchDate) {
            return;
        }

        const opponent = editSale.Match.Opponent.name;
        const ok = confirm(
            `Mark the ${opponent} sale as sold? Match was on ${dateTime(editMatchDate)}; this writes a historical sale.`,
        );

        if (!ok) {
            event.preventDefault();
        }
    }

    function confirmRevert(event: Event): void {
        if (!editSale) {
            return;
        }

        const opponent = editSale.Match.Opponent.name;
        const ok = confirm(
            `Revert the ${opponent} sale to pending? This removes ${signedMoney(editSale.profit)} from realized profit.`,
        );

        if (!ok) {
            event.preventDefault();
        }
    }
</script>

{#snippet editPanel(saleId: string)}
    {#if editSale && editSale.id === saleId}
        <div
            class="bg-surface-subtle border-t border-line p-4 space-y-3"
            role="region"
            aria-label="Edit sale vs {editSale.Match.Opponent.name}"
        >
            <div
                class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs"
            >
                <span class="text-ink-muted">
                    Currently
                    <span
                        class="ml-1 inline-block px-2 py-0.5 rounded font-medium {statusPill(
                            editSale.status,
                        )}"
                    >
                        {editSale.status}
                    </span>
                </span>
                {#if editMatchDate}
                    <span class="text-ink-faint font-mono">
                        {dateTime(editMatchDate)}
                    </span>
                {/if}
            </div>

            {#if isPastMatch && editMatchDate}
                <div
                    role="alert"
                    class="rounded-lg border border-warning bg-warning/10 px-3 py-2 text-xs text-warning-strong"
                >
                    Match has already been played. Saving here rewrites the original
                    sale record.
                </div>
            {/if}

            <!-- Status commit block. Marking a sale SOLD is the moment money
                 becomes realized profit; it deserves its own affordance with the
                 profit delta shown inline, not a checkbox buried in the input grid. -->
            <div
                class="rounded-lg border border-line bg-surface p-3 space-y-2"
                aria-label="Sale status"
            >
                {#if editSale.status === 'SOLD'}
                    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p class="text-sm text-ink">
                            <span class="font-medium text-positive-strong">Sold</span>
                            <span class="text-ink-muted">·</span>
                            <span class="font-mono text-positive">
                                {signedMoney(editSale.profit)}
                            </span>
                            <span class="text-ink-muted">in realized profit</span>
                        </p>

                        <form
                            method="POST"
                            action="?/update"
                            use:enhance={trackFlip}
                        >
                            <input type="hidden" name="saleId" value={editSale.id} />
                            <input type="hidden" name="sold" value="false" />
                            <button
                                type="submit"
                                disabled={submitting !== null}
                                onclick={confirmRevert}
                                class="text-sm text-ink-muted hover:text-ink hover:underline disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
                            >
                                {#if submitting === 'flip'}
                                    <Spinner size="1em" />
                                {/if}
                                Revert to pending
                            </button>
                        </form>
                    </div>
                {:else}
                    <form
                        method="POST"
                        action="?/update"
                        class="space-y-2"
                        use:enhance={trackFlip}
                    >
                        <input type="hidden" name="saleId" value={editSale.id} />
                        <input type="hidden" name="sold" value="true" />

                        <button
                            type="submit"
                            disabled={submitting !== null}
                            onclick={confirmMarkSold}
                            class="w-full rounded bg-positive text-surface px-4 py-2.5 font-medium hover:bg-positive-strong disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors"
                        >
                            {#if submitting === 'flip'}
                                <Spinner size="1em" />
                            {/if}
                            Mark sold
                            <span class="text-surface/80">·</span>
                            <span class="font-mono">
                                {signedMoney(editSale.profit)}
                            </span>
                            <span class="text-surface/80 font-normal">to realized</span>
                        </button>
                        <p class="text-xs text-ink-faint">
                            {editSale.status === 'CANCELLED'
                                ? 'Restores this sale and credits realized profit.'
                                : 'Adds this sale to realized profit on the dashboard.'}
                        </p>
                    </form>
                {/if}
            </div>

            <!-- Edit numbers form. Status changes go through the block above; the
                 hidden sold input preserves current status so a save here doesn't
                 accidentally flip the sale. -->
            <form
                method="POST"
                action="?/update"
                class="grid sm:grid-cols-2 gap-3"
                use:enhance={trackSubmit}
            >
                <input type="hidden" name="saleId" value={editSale.id} />
                <input
                    type="hidden"
                    name="sold"
                    value={editSale.status === 'SOLD' ? 'true' : 'false'}
                />

                <label class="block">
                    <span class="text-xs text-ink-muted">Tickets</span>
                    <input
                        bind:this={firstFieldEl}
                        type="number"
                        name="nbTickets"
                        min="1"
                        step="1"
                        value={editSale.nbTickets}
                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-1.5 text-sm"
                    />
                </label>

                <label class="block">
                    <span class="text-xs text-ink-muted">Listed price (€)</span>
                    <input
                        type="number"
                        name="listedPrice"
                        min="1"
                        step="0.01"
                        value={editSale.listedPrice}
                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-1.5 text-sm"
                    />
                </label>

                <label class="block sm:col-span-2">
                    <span class="text-xs text-ink-muted">Cost paid for tickets (€)</span>
                    <input
                        type="number"
                        name="invest"
                        min="0"
                        step="0.01"
                        value={editSale.invest}
                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-1.5 text-sm"
                    />
                </label>

                {#if form?.message}
                    <p
                        role="alert"
                        class="sm:col-span-2 text-sm text-negative-strong"
                    >
                        {form.message}
                    </p>
                {/if}

                <div class="sm:col-span-2 flex flex-wrap items-center gap-2 pt-2">
                    <button
                        type="submit"
                        disabled={submitting !== null}
                        class="rounded bg-primary text-surface px-3 py-1.5 text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
                        onclick={(event) => confirmIfPast(event, 'save')}
                    >
                        {#if submitting === 'update'}
                            <Spinner size="1em" />
                        {/if}
                        Save changes
                    </button>

                    <button
                        type="submit"
                        formaction="?/delete"
                        formnovalidate
                        disabled={submitting !== null}
                        class="rounded border border-negative text-negative-strong px-3 py-1.5 text-sm font-medium hover:bg-negative/5 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
                        onclick={confirmDelete}
                    >
                        {#if submitting === 'delete'}
                            <Spinner size="1em" />
                        {/if}
                        Delete sale
                    </button>

                    <a
                        href={urlWithEdit(null)}
                        class="ml-auto text-sm text-ink-muted hover:text-ink hover:underline px-2 py-1.5"
                    >
                        Cancel <kbd
                            class="ml-1 font-mono text-[10px] text-ink-faint"
                            aria-hidden="true">Esc</kbd
                        >
                    </a>
                </div>
            </form>
        </div>
    {/if}
{/snippet}

<svelte:window onkeydown={onWindowKeydown} />

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
            {@const isOpen = editId === sale.id}
            <li
                class="bg-surface rounded-lg border {isOpen
                    ? 'border-line-strong'
                    : 'border-line'} overflow-hidden"
            >
                <a
                    href={urlWithEdit(isOpen ? null : sale.id)}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? `edit-${sale.id}` : undefined}
                    class="block p-4 hover:bg-surface-subtle transition-colors"
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
                            class="text-right font-mono {profitTone(
                                sale.status,
                                sale.profit,
                            )}"
                        >
                            {signedMoney(sale.profit)}
                        </dd>
                    </dl>
                </a>

                {#if isOpen}
                    <div id="edit-{sale.id}">
                        {@render editPanel(sale.id)}
                    </div>
                {/if}
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
                    {@const isOpen = editId === sale.id}
                    <tr class={isOpen ? 'bg-surface-subtle' : ''}>
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
                            class="px-4 py-2 text-right font-mono {profitTone(
                                sale.status,
                                sale.profit,
                            )}"
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
                                href={urlWithEdit(isOpen ? null : sale.id)}
                                aria-expanded={isOpen}
                                aria-controls={isOpen ? `edit-${sale.id}` : undefined}
                                class="text-primary font-medium hover:text-primary-hover hover:underline"
                            >
                                {isOpen ? 'Close' : 'Edit'}
                            </a>
                        </td>
                    </tr>
                    {#if isOpen}
                        <tr id="edit-{sale.id}">
                            <td colspan="7" class="p-0">
                                {@render editPanel(sale.id)}
                            </td>
                        </tr>
                    {/if}
                {/each}
            </tbody>
        </table>
    </div>
{/if}
