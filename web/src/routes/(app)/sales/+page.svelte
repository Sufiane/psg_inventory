<script lang="ts">
    import type { SubmitFunction } from '@sveltejs/kit';
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { tick } from 'svelte';
    import {
        competitionLabel,
        dateTime,
        daysBetween,
        leadDaysLabel,
        money,
        shortDate,
        signedMoney,
    } from '$lib/format';
    import { passesForMatch } from '$lib/sale-passes';
    import { saleNet, summarizeSales } from '$lib/sale-math';
    import { seasonLabel, seasonLabelFromDate } from '$lib/season';
    import { profitTone } from '$lib/sale-helpers';
    import {
        filterByStatus,
        parseStatusParam,
        pendingFirst,
        sortSales,
        statusTabs,
        type SaleSortDir,
        type SaleSortKey,
    } from '$lib/sales-view';
    import type { SaleListItem } from '$lib/types';
    import SaleEditPanel from '$lib/ui/SaleEditPanel.svelte';
    import SalesToolbar from '$lib/ui/SalesToolbar.svelte';
    import SalesTotals from '$lib/ui/SalesTotals.svelte';
    import StatusChip from '$lib/ui/StatusChip.svelte';
    import Spinner from '$lib/ui/Spinner.svelte';
    import ImportSalesModal from '$lib/ui/ImportSalesModal.svelte';
    import { invalidateAll } from '$app/navigation';

    /**
     * Single-line temporal note for a sale row. Quiet, present-tense, no
     * decorative glyphs — pairs with the status pill rather than replacing it.
     */
    function lifecycleNote(sale: SaleListItem): string | null {
        if (sale.status === 'SOLD' && sale.soldAt && sale.matchDate) {
            const lead = Math.max(0, daysBetween(sale.soldAt, sale.matchDate));

            return `Sold ${leadDaysLabel(lead)}`;
        }

        if (sale.status === 'PENDING' && sale.createdAt) {
            const ageDays = Math.max(0, daysBetween(sale.createdAt, new Date()));

            if (ageDays === 0) {
                return 'Listed today';
            }

            return `Listed ${ageDays} d ago`;
        }

        return null;
    }

    function giftLabel(sale: SaleListItem): string {
        return sale.Gift ? `Gifted to ${sale.Gift.Recipient.name}` : 'Gifted';
    }

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const SORT_LABELS: Record<SaleSortKey, string> = {
        nbTickets: 'Tickets',
        listedPrice: 'Price',
        invest: 'Invest',
        profit: 'Profit',
    };

    let sortKey = $state<SaleSortKey | null>(null);
    let sortDir = $state<SaleSortDir>('desc');

    function toggleSort(key: SaleSortKey): void {
        if (sortKey === key) {
            sortDir = sortDir === 'desc' ? 'asc' : 'desc';

            return;
        }

        sortKey = key;
        sortDir = 'desc';
    }

    function ariaSort(key: SaleSortKey): 'ascending' | 'descending' | 'none' {
        if (sortKey !== key) {
            return 'none';
        }

        return sortDir === 'asc' ? 'ascending' : 'descending';
    }

    function arrow(key: SaleSortKey): string {
        if (sortKey !== key) {
            return '';
        }

        return sortDir === 'asc' ? '↑' : '↓';
    }

    function onMobileSortChange(event: Event): void {
        const value = (event.currentTarget as HTMLSelectElement).value;

        sortKey = value === '' ? null : (value as SaleSortKey);
    }

    // URL-driven expand state. `?edit={saleId}` opens the inline form for that row.
    let editId = $derived(page.url.searchParams.get('edit'));

    let statusFilter = $derived(parseStatusParam(page.url));
    let rows = $derived(
        sortSales(pendingFirst(filterByStatus(data.sales, statusFilter, editId)), sortKey, sortDir),
    );
    let summary = $derived(
        summarizeSales(filterByStatus(data.sales, statusFilter, null)),
    );
    let showSeason = $derived(data.season === 'all');
    let columnCount = $derived(showSeason ? 8 : 7);
    let seasonName = $derived(
        data.season === 'all' ? 'all seasons' : seasonLabel(data.season),
    );
    let tabs = $derived(statusTabs(page.url));
    let editSale = $derived(data.editSale);

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

    let submitting = $state<'update' | 'delete' | 'create' | null>(null);

    let newPanelFirstEl = $state<HTMLSelectElement | HTMLButtonElement | null>(null);

    // `canCreate` is computed server-side against the sanitized season year
    // (see +page.server.ts) — the panel only opens for the current season.
    let isNew = $derived(data.isNew && !editId && data.canCreate);
    let importOpen = $state(false);

    let newSaleMatchId = $state('');

    let newSaleMatch = $derived(
        data.matches.find((match) => match.id === newSaleMatchId) ?? null,
    );
    let newSaleSeasonLabel = $derived(seasonLabelFromDate(newSaleMatch?.date));
    let newSaleVisiblePasses = $derived(passesForMatch(data.passes, newSaleMatch?.date));

    async function onImportCommitted(): Promise<void> {
        importOpen = false;
        await invalidateAll();
    }

    // When ?edit={id} resolves to a real editSale, move keyboard focus to the
    // first input so Sam (screen reader) and Alex (keyboard) land in the form
    // instead of on the now-stale trigger link. Awaiting tick() ensures the
    // panel is mounted before we attempt focus.
    $effect(() => {
        if (editId && editSale && editSale.id === editId) {
            void tick().then(() => {
                const firstField = document.querySelector<HTMLElement>('[data-edit-first]');

                firstField?.focus();

                if (firstField instanceof HTMLInputElement) {
                    firstField.select();
                }
            });
        }
    });

    // Same treatment for the new-sale panel: focus the Match select on open.
    $effect(() => {
        if (isNew) {
            void tick().then(() => {
                newPanelFirstEl?.focus();
            });
        }
    });

    // The panel is a snippet inside the page, not a fresh component — without
    // this, reopening it inherits the previous pick and its filtered list.
    $effect(() => {
        if (!isNew) {
            newSaleMatchId = '';
        }
    });

    function urlWithNew(open: boolean): string {
        const params = new URLSearchParams(page.url.searchParams);

        params.delete('edit');

        if (open) {
            params.set('new', '1');
        } else {
            params.delete('new');
        }

        const qs = params.toString();

        return qs ? `/sales?${qs}` : '/sales';
    }

    function urlClosed(): string {
        const params = new URLSearchParams(page.url.searchParams);

        params.delete('edit');
        params.delete('new');

        const qs = params.toString();

        return qs ? `/sales?${qs}` : '/sales';
    }

    function onWindowKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Escape') {
            return;
        }

        if (!editId && !isNew) {
            return;
        }

        // Don't fight native confirm() dialogs; if anything is in flight, skip.
        if (submitting !== null) {
            return;
        }

        event.preventDefault();
        void goto(urlClosed(), { keepFocus: false, noScroll: true });
    }

    function trackCreate({ cancel }: { cancel: () => void }): ReturnType<SubmitFunction> {
        if (submitting !== null) {
            cancel();

            return;
        }

        submitting = 'create';

        return async ({ update }: { update: () => Promise<void> }): Promise<void> => {
            await update();
            submitting = null;
        };
    }

    const trackSubmit: SubmitFunction = ({ action, cancel }) => {
        const which: 'update' | 'delete' = action.search.includes('delete')
            ? 'delete'
            : 'update';

        if (submitting !== null) {
            cancel();

            return;
        }

        submitting = which;

        return async ({ update }) => {
            await update();
            submitting = null;
        };
    };
</script>

{#snippet editPanel(saleId: string, layout: 'card' | 'row')}
    {#if editSale && editSale.id === saleId}
        <SaleEditPanel
            sale={editSale}
            {layout}
            passes={data.passes}
            homeFixtures={data.editHomeFixtures}
            commissionPercent={data.commissionPercent}
            errorMessage={form?.message}
            closeHref={urlWithEdit(null)}
            {submitting}
            enhanceSubmit={trackSubmit}
        />
    {/if}
{/snippet}

{#snippet newSalePanel()}
    <section
        class="bg-surface rounded-lg border border-line-strong p-4 mb-6 space-y-3"
        aria-label="New sale"
    >
        <header class="flex items-baseline justify-between gap-3">
            <h2 class="text-base font-semibold tracking-tight text-ink">New sale</h2>
            <a
                href={urlWithNew(false)}
                class="text-sm text-ink-muted hover:text-ink hover:underline"
            >
                Cancel <kbd
                    class="ml-1 font-mono text-[10px] text-ink-faint"
                    aria-hidden="true">Esc</kbd
                >
            </a>
        </header>

        <form
            method="POST"
            action="?/create"
            class="grid sm:grid-cols-2 gap-3"
            use:enhance={trackCreate}
        >
            {#if data.matches.length === 0}
                <p class="sm:col-span-2 text-xs text-ink-faint">
                    No upcoming matches — nothing to log a sale against right now.
                    <button
                        bind:this={newPanelFirstEl}
                        type="button"
                        onclick={(): void => {
                            importOpen = true;
                        }}
                        class="text-primary font-medium hover:text-primary-hover hover:underline"
                    >
                        Use Import CSV instead.
                    </button>
                </p>
            {:else}
                <label class="block sm:col-span-2">
                    <span class="text-xs text-ink-muted">Match</span>
                    <select
                        bind:this={newPanelFirstEl}
                        bind:value={newSaleMatchId}
                        name="matchId"
                        required
                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-1.5 text-sm"
                    >
                        <option value="">Select a match…</option>
                        {#each data.matches as match (match.id)}
                            <option value={match.id}>
                                {dateTime(match.date)}, {match.atHome ? 'vs' : '@'}
                                {match.opponent}
                                ({competitionLabel(match.competition)})
                            </option>
                        {/each}
                    </select>
                </label>
            {/if}

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

            <label class="block">
                <span class="text-xs text-ink-muted">Listed price (€)</span>
                <input
                    type="number"
                    name="listedPrice"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    required
                    class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-1.5 text-sm"
                />
            </label>

            <label class="block sm:col-span-2">
                <span class="text-xs text-ink-muted">Cost paid for tickets (€, optional)</span>
                <input
                    type="number"
                    name="invest"
                    min="0"
                    step="1"
                    inputmode="numeric"
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

            <div class="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
                <button
                    type="submit"
                    disabled={submitting !== null || data.matches.length === 0}
                    class="rounded bg-brand text-on-brand px-3 py-1.5 text-sm font-medium hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
                >
                    {#if submitting === 'create'}
                        <Spinner size="1em" />
                    {/if}
                    Create sale
                </button>
            </div>
        </form>
    </section>
{/snippet}

{#snippet saleCard(sale: SaleListItem)}
    {@const isOpen = editId === sale.id}
    {@const mobileNote = lifecycleNote(sale)}
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
            <header class="flex items-baseline justify-between gap-3 mb-1">
                <span class="font-medium text-ink truncate">{sale.opponent.name}</span>
                <StatusChip status={sale.status} />
            </header>
            {#if sale.matchDate}
                <p class="text-xs text-ink-faint">
                    {shortDate(sale.matchDate)}{showSeason
                        ? ` · ${seasonLabelFromDate(sale.matchDate)}`
                        : ''}
                </p>
            {/if}
            {#if mobileNote}
                <p class="mb-2 text-xs text-ink-faint">{mobileNote}</p>
            {/if}
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt class="text-ink-muted">Tickets</dt>
                <dd class="text-right font-mono text-ink">{sale.nbTickets}</dd>

                {#if sale.status === 'GIFTED'}
                    <dt class="text-ink-muted">Gift</dt>
                    <dd class="text-right text-gift">{giftLabel(sale)}</dd>
                {:else}
                    <dt class="text-ink-muted">Price</dt>
                    <dd class="text-right font-mono text-ink">
                        {money(sale.listedPrice)}
                    </dd>

                    <dt class="text-ink-muted">Invest</dt>
                    <dd class="text-right font-mono text-ink">
                        {money(sale.invest)}
                    </dd>

                    <dt class="text-ink-muted">Profit</dt>
                    {#if sale.status === 'CANCELLED'}
                        <dd class="text-right font-mono text-sunk">—</dd>
                    {:else}
                        <dd
                            class="text-right font-mono {profitTone(
                                sale.status,
                                saleNet(sale),
                            )}"
                        >
                            {signedMoney(saleNet(sale))}
                        </dd>
                    {/if}
                {/if}
            </dl>
        </a>

        {#if isOpen}
            <div id="edit-{sale.id}">
                {@render editPanel(sale.id, 'card')}
            </div>
        {/if}
    </li>
{/snippet}

{#snippet saleRow(sale: SaleListItem)}
    {@const isOpen = editId === sale.id}
    {@const desktopNote = lifecycleNote(sale)}
    <tr class={isOpen ? 'bg-surface-subtle' : ''}>
        <td class="px-4 py-2 text-ink">
            {sale.opponent.name}
            {#if sale.matchDate}
                <div class="text-xs text-ink-faint">{shortDate(sale.matchDate)}</div>
            {/if}
        </td>
        {#if showSeason}
            <td class="px-4 py-2 text-ink-muted">{seasonLabelFromDate(sale.matchDate)}</td>
        {/if}
        <td class="px-4 py-2 text-right font-mono text-ink">
            {sale.nbTickets}
        </td>
        <td class="px-4 py-2">
            <StatusChip status={sale.status} />
            {#if desktopNote}
                <div class="mt-1 text-[0.65rem] text-ink-faint leading-snug">
                    {desktopNote}
                </div>
            {/if}
        </td>
        {#if sale.status === 'GIFTED'}
            <td colspan="3" class="px-4 py-2 text-right text-gift">{giftLabel(sale)}</td>
        {:else}
            <td class="px-4 py-2 text-right font-mono text-ink">
                {money(sale.listedPrice)}
            </td>
            <td class="px-4 py-2 text-right font-mono text-ink">
                {money(sale.invest)}
            </td>
        {/if}
        {#if sale.status === 'CANCELLED'}
            <td class="px-4 py-2 text-right font-mono text-sunk">—</td>
        {:else if sale.status !== 'GIFTED'}
            <td
                class="px-4 py-2 text-right font-mono {profitTone(
                    sale.status,
                    saleNet(sale),
                )}"
            >
                {signedMoney(saleNet(sale))}
            </td>
        {/if}
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
            <td colspan={columnCount} class="p-0">
                {@render editPanel(sale.id, 'row')}
            </td>
        </tr>
    {/if}
{/snippet}

<svelte:window onkeydown={onWindowKeydown} />

<datalist id="recipient-options">
    {#each data.recipients as recipient (recipient.id)}
        <option value={recipient.name}></option>
    {/each}
</datalist>

<SalesToolbar
    {tabs}
    canCreate={data.canCreate}
    showActions={!isNew}
    newHref={urlWithNew(true)}
    onImport={(): void => {
        importOpen = true;
    }}
/>

<ImportSalesModal
    open={importOpen}
    passes={data.passes}
    onClose={(): void => {
        importOpen = false;
    }}
    onCommitted={onImportCommitted}
/>

{#if isNew}
    {@render newSalePanel()}
{/if}

{#if data.sales.length === 0}
    <p class="text-ink-faint text-sm">No sales in {seasonName}.</p>
{:else if rows.length === 0}
    <p class="text-ink-faint text-sm">
        No {statusFilter.toLowerCase()} sales in {seasonName}.
    </p>
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
                onclick={(): void => {
                    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
                }}
                class="rounded border border-line-strong bg-surface text-ink-muted hover:text-ink hover:border-ink px-2 py-1.5 transition-colors font-mono"
                aria-label="Toggle sort direction"
            >
                {sortDir === 'desc' ? '↓' : '↑'}
            </button>
        {/if}
    </div>

    <!-- Mobile card list -->
    <ul class="grid gap-3 sm:hidden">
        {#each rows as sale (sale.id)}
            {@render saleCard(sale)}
        {/each}
    </ul>
    <div class="sm:hidden">
        <SalesTotals {summary} variant="block" />
    </div>

    <!-- Desktop / tablet table -->
    <div class="hidden sm:block bg-surface rounded-lg border border-line overflow-x-auto">
        <table class="w-full text-sm">
            <thead class="bg-surface-subtle text-ink-muted text-xs">
                <tr>
                    <th class="text-left px-4 py-2 font-medium">Match</th>
                    {#if showSeason}
                        <th class="text-left px-4 py-2 font-medium">Season</th>
                    {/if}
                    <th
                        class="text-right px-4 py-2 font-medium"
                        aria-sort={ariaSort('nbTickets')}
                    >
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 hover:text-ink transition-colors w-full justify-end"
                            onclick={(): void => toggleSort('nbTickets')}
                        >
                            Tickets
                            <span aria-hidden="true" class="font-mono w-3 text-ink">
                                {arrow('nbTickets')}
                            </span>
                        </button>
                    </th>
                    <th class="text-left px-4 py-2 font-medium">Status</th>
                    <th
                        class="text-right px-4 py-2 font-medium"
                        aria-sort={ariaSort('listedPrice')}
                    >
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 hover:text-ink transition-colors w-full justify-end"
                            onclick={(): void => toggleSort('listedPrice')}
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
                            onclick={(): void => toggleSort('invest')}
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
                            onclick={(): void => toggleSort('profit')}
                        >
                            Profit
                            <span aria-hidden="true" class="font-mono w-3 text-ink">
                                {arrow('profit')}
                            </span>
                        </button>
                    </th>
                    <th class="px-4 py-2"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-line">
                {#each rows as sale (sale.id)}
                    {@render saleRow(sale)}
                {/each}
            </tbody>
            <tfoot>
                <SalesTotals {summary} variant="row" {showSeason} />
            </tfoot>
        </table>
    </div>
{/if}
