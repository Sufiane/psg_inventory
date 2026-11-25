<script lang="ts">
    import type { PageData } from './$types';
    import { page } from '$app/state';
    import AccountingCard from '$lib/ui/AccountingCard.svelte';
    import LeadTimeStrip from '$lib/ui/LeadTimeStrip.svelte';
    import NetProfitSkeleton from '$lib/ui/NetProfitSkeleton.svelte';
    import Skeleton from '$lib/ui/Skeleton.svelte';
    import MathBlock from '$lib/ui/MathBlock.svelte';
    import AmortisationBlock from '$lib/ui/AmortisationBlock.svelte';
    import FilterTabs from '$lib/ui/FilterTabs.svelte';
    import MatchdayStrip from '$lib/ui/MatchdayStrip.svelte';
    import SeasonMatchTable from '$lib/ui/SeasonMatchTable.svelte';
    import { money, signedMoney } from '$lib/format';
    import { groupSalesByMatch, realizedFigures, summarizeSales } from '$lib/sale-math';
    import {
        filterSegments,
        hiddenWithSales,
        homeMatchCount,
        parseVenue,
        stripSegments,
        tableGroups,
        venueHref,
        type Venue,
    } from '$lib/accounting-view';
    import { carrySeason } from '$lib/season';

    let { data }: { data: PageData } = $props();

    const isAll = $derived(data.season === 'all');
    const venue = $derived(parseVenue(page.url.searchParams.get('venue')));
    const venueTabs: { value: Venue; label: string }[] = [
        { value: 'both', label: 'All' },
        { value: 'home', label: 'Home' },
        { value: 'away', label: 'Away' },
    ];

    function netTone(value: number): string {
        if (value < 0) {
            return 'text-negative-strong';
        }

        if (value > 0) {
            return 'text-positive-strong';
        }

        return 'text-ink';
    }

    function proceedsTone(value: number): string {
        if (value < 0) {
            return 'text-negative';
        }

        if (value > 0) {
            return 'text-positive';
        }

        return 'text-ink';
    }
</script>

<div class="mb-6">
    <h1 class="text-2xl font-display font-semibold tracking-tight text-ink">
        {isAll ? 'Accounting' : 'Season accounting'}
    </h1>
</div>

{#await data.accounting}
    <NetProfitSkeleton />
{:then accounting}
    {@const figures = realizedFigures(accounting)}
    {@const pendingSales = accounting.pending?.salesCount ?? 0}
    <section aria-labelledby="figures-heading" class="mb-6">
        <h2 id="figures-heading" class="text-sm font-medium text-ink-muted">Season figures</h2>

        <div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-lg border border-line bg-surface p-5 lg:col-span-full">
                <h3 class="text-sm font-medium text-ink-muted">Net realized profit</h3>
                <p
                    class="mt-1 font-mono text-3xl font-display font-semibold tracking-tight {netTone(
                        figures.net,
                    )}"
                    data-numeric
                >
                    {signedMoney(figures.net)}
                </p>
            </div>

            <div class="rounded-lg border border-line bg-surface p-5">
                <h3 class="text-sm font-medium text-ink-muted">Realized proceeds (SOLD)</h3>
                <p
                    class="mt-1 font-mono text-2xl font-semibold tracking-tight {proceedsTone(
                        figures.proceeds,
                    )}"
                    data-numeric
                >
                    {signedMoney(figures.proceeds)}
                </p>
            </div>

            <div class="rounded-lg border border-line bg-surface p-5">
                <h3 class="text-sm font-medium text-ink-muted">Pending</h3>
                <p
                    class="mt-1 font-mono text-2xl font-semibold tracking-tight text-warning-strong"
                    data-numeric
                >
                    {signedMoney(accounting.pending?.totalProfit ?? 0)}
                </p>
                <p class="mt-1 text-xs text-ink-muted" data-numeric>
                    {pendingSales} {pendingSales === 1 ? 'sale' : 'sales'}
                </p>
            </div>

            <div class="rounded-lg border border-line bg-surface p-5">
                <h3 class="text-sm font-medium text-ink-muted">Season pass cost</h3>
                {#if figures.seasonInvest === 0 && !isAll}
                    <p class="mt-1 text-sm text-ink">Not set</p>
                    <p class="mt-1 text-xs text-ink-muted">
                        <a
                            href={carrySeason('/season', page.url)}
                            class="text-primary font-medium hover:text-primary-hover hover:underline"
                            >Set it on the Season page</a
                        >
                    </p>
                {:else}
                    <p
                        class="mt-1 font-mono text-2xl font-semibold tracking-tight text-ink"
                        data-numeric
                    >
                        {money(figures.seasonInvest)}
                    </p>
                {/if}
            </div>
        </div>
    </section>
{:catch err}
    <p
        role="alert"
        class="mb-6 rounded-lg border border-negative bg-negative/5 text-negative-strong text-sm px-4 py-3"
    >
        Failed to load accounting: {err?.message ?? 'unknown error'}
    </p>
{/await}

{#if !isAll}
    {#await data.seasonView}
        <div class="mb-6 space-y-4">
            <Skeleton height="6rem" width="100%" rounded="rounded-lg" />
            <Skeleton height="7rem" width="100%" rounded="rounded-lg" />
        </div>
    {:then view}
        {@const salesByMatch = groupSalesByMatch(view.sales)}
        <div class="mb-6 space-y-6">
            {#if view.amortization}
                <AmortisationBlock data={view.amortization} homeMatchCount={homeMatchCount(view.matches)} />
            {/if}

            {#if view.matches.length > 0}
                {@const segments = stripSegments(
                    view.matches,
                    salesByMatch,
                    view.amortization?.breakEven?.matchId ?? null,
                )}
                {@const visible = filterSegments(segments, venue)}
                {@const hidden = hiddenWithSales(segments, venue)}
                <div class="space-y-2">
                    <div data-sveltekit-noscroll data-sveltekit-keepfocus>
                        <FilterTabs
                            label="Venue"
                            tabs={venueTabs.map((tab) => ({
                                href: venueHref(page.url, tab.value),
                                label: tab.label,
                                active: venue === tab.value,
                            }))}
                        />
                    </div>
                    {#if hidden > 0}
                        <p class="text-xs text-ink-faint">
                            {hidden}
                            {venue === 'home' ? 'away' : 'home'}
                            {hidden === 1 ? 'match' : 'matches'} with sales hidden.
                        </p>
                    {/if}
                    {#if visible.length === 0}
                        <p class="text-sm text-ink-faint">No {venue} matches this season.</p>
                    {:else}
                        <MatchdayStrip segments={visible} />
                    {/if}
                </div>
            {/if}
        </div>
    {:catch err}
        <p
            role="alert"
            class="mb-6 rounded-lg border border-negative bg-negative/5 text-negative-strong text-sm px-4 py-3"
        >
            Failed to load matchday details: {err?.message ?? 'unknown error'}
        </p>
    {/await}
{/if}

{#await data.accounting}
    <div class="mb-6">
        <Skeleton height="8rem" width="100%" rounded="rounded-lg" />
    </div>
{:then accounting}
    {@const figures = realizedFigures(accounting)}
    <section aria-labelledby="waterfall-heading" class="mb-6 max-w-lg">
        <h2 id="waterfall-heading" class="text-sm font-medium text-ink-muted">
            How net profit is calculated
        </h2>

        <div class="mt-3 rounded-lg border border-line bg-surface p-5">
            <MathBlock
                lines={[
                    {
                        label: 'Realized proceeds (SOLD)',
                        value: figures.proceeds,
                        sign: 'plus',
                    },
                    { label: 'Ticket invest', value: figures.invest, sign: 'minus' },
                    { label: 'Season pass', value: figures.seasonInvest, sign: 'minus' },
                ]}
                resultLabel="Net realized profit"
                result={figures.net}
            />
        </div>
    </section>
{:catch}
<!-- error banner rendered above -->
{/await}

{#if !isAll}
    {#await data.seasonView}
        <div class="mb-6">
            <Skeleton height="12rem" width="100%" rounded="rounded-lg" />
        </div>
    {:then view}
        <SeasonMatchTable
            groups={tableGroups(view.matches, groupSalesByMatch(view.sales))}
            summary={summarizeSales(view.sales)}
        />
    {:catch}
    <!-- error banner rendered above -->
    {/await}
{/if}

{#await data.accounting}
    <div class="mb-6">
        <Skeleton height="6rem" width="100%" rounded="rounded-lg" />
    </div>
{:then accounting}
    <details class="mb-6 rounded-lg border border-line bg-surface">
        <summary
            class="cursor-pointer select-none px-5 py-3 text-sm font-medium text-ink hover:text-ink"
            >Details</summary
        >
        <div class="space-y-4 border-t border-line px-5 py-4">
            {#if accounting.leadTime && accounting.leadTime.soldCount >= 3}
                <LeadTimeStrip data={accounting.leadTime} />
            {/if}
            <AccountingCard
                title="Realized"
                data={accounting.realized}
                showSeason={isAll}
                showDate={!isAll}
            />
        </div>
    </details>
{:catch}
<!-- error banner rendered above -->
{/await}
