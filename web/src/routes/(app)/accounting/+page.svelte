<script lang="ts">
    import type { PageData } from './$types';
    import { fade } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import AccountingCard from '$lib/ui/AccountingCard.svelte';
    import AccountingCardSkeleton from '$lib/ui/AccountingCardSkeleton.svelte';
    import NetProfitSkeleton from '$lib/ui/NetProfitSkeleton.svelte';
    import AmortizationCard from '$lib/ui/AmortizationCard.svelte';
    import AmortizationCardSkeleton from '$lib/ui/AmortizationCardSkeleton.svelte';
    import LeadTimeStrip from '$lib/ui/LeadTimeStrip.svelte';
    import { signedMoney } from '$lib/format';

    let { data }: { data: PageData } = $props();

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

    let tab = $derived(data.view);
</script>

<div class="flex flex-wrap items-end justify-between gap-4 mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Accounting</h1>

    <div
        class="inline-flex items-center gap-1 bg-surface border border-line-strong rounded-lg p-1"
        role="navigation"
        aria-label="Accounting period"
    >
        <a
            href="/accounting?view=current"
            aria-current={tab === 'current' ? 'page' : undefined}
            class="px-3 py-2 text-sm rounded-md transition-colors duration-150 {tab ===
            'current'
                ? 'bg-primary text-surface'
                : 'text-ink-muted hover:bg-surface-strong hover:text-ink'}"
        >
            Current
        </a>
        <a
            href="/accounting?view=all-time"
            aria-current={tab === 'all-time' ? 'page' : undefined}
            class="px-3 py-2 text-sm rounded-md transition-colors duration-150 {tab ===
            'all-time'
                ? 'bg-primary text-surface'
                : 'text-ink-muted hover:bg-surface-strong hover:text-ink'}"
        >
            All time
        </a>

        <form method="GET" class="flex items-center">
            <input type="hidden" name="view" value="season" />
            <label for="accounting-season" class="sr-only">View a specific season</label>
            <select
                id="accounting-season"
                name="year"
                aria-current={tab === 'season' ? 'page' : undefined}
                class="border-0 outline-0 px-2 py-2 text-sm rounded-md cursor-pointer transition-colors duration-150 {tab ===
                'season'
                    ? 'bg-primary text-surface'
                    : 'bg-transparent text-ink-muted hover:bg-surface-strong hover:text-ink'}"
                onchange={(event) => event.currentTarget.form?.requestSubmit()}
            >
                <option value="" disabled hidden>Season</option>
                {#each years as year (year)}
                    <option value={year} selected={data.year === year}>{year}</option>
                {/each}
            </select>
        </form>
    </div>
</div>

{#await data.accounting}
    <div class="grid gap-4 mb-6 lg:grid-cols-2 lg:items-start">
        <NetProfitSkeleton />
        {#if tab !== 'all-time'}
            <AmortizationCardSkeleton />
        {/if}
    </div>
    <div class="mb-4">
        <AccountingCardSkeleton title="Realized" />
    </div>
    <div class="grid sm:grid-cols-2 gap-4">
        <AccountingCardSkeleton title="Unrealized" variant="compact" />
        <AccountingCardSkeleton title="Pending" variant="compact" />
    </div>
{:then accounting}
    {@const realizedProceeds = accounting.realized?.totalProfit ?? 0}
    {@const realizedInvest = accounting.realized?.totalInvest ?? 0}
    {@const seasonInvest = accounting.totalSeasonInvestment}
    {@const netProfit = realizedProceeds - realizedInvest - seasonInvest}
    {@const showSeason = tab === 'all-time'}

    <div in:fade={{ duration: 120, easing: cubicOut }}>
    <div class="grid gap-4 mb-6 lg:grid-cols-2 lg:items-start">
    <section
        class="bg-surface rounded-lg border border-line p-5 max-w-lg"
        aria-labelledby="net-profit-heading"
    >
        <h2 id="net-profit-heading" class="text-sm font-medium text-ink-muted">
            Net realized profit
        </h2>
        <p
            class="mt-1 font-mono text-3xl font-semibold tracking-tight {netProfit < 0
                ? 'text-negative-strong'
                : netProfit > 0
                  ? 'text-positive-strong'
                  : 'text-ink'}"
        >
            {signedMoney(netProfit)}
        </p>

        <dl class="mt-5 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <dt class="text-ink-muted">Realized proceeds</dt>
            <dd
                class="text-right font-mono {realizedProceeds < 0
                    ? 'text-negative'
                    : realizedProceeds > 0
                      ? 'text-positive'
                      : 'text-ink'}"
            >
                {signedMoney(realizedProceeds)}
            </dd>

            <dt class="text-ink-muted">
                Ticket invest{tab === 'all-time' ? ' (all time)' : ''}
            </dt>
            <dd class="text-right font-mono text-ink-muted">
                {signedMoney(-realizedInvest)}
            </dd>

            <dt class="text-ink-muted">
                Season investment{tab === 'all-time' ? ' (all seasons)' : ''}
            </dt>
            <dd class="text-right font-mono text-ink-muted">
                {signedMoney(-seasonInvest)}
            </dd>
        </dl>

        {#if accounting.seasonInvestment}
            <p class="mt-4 text-xs text-ink-muted">
                Season {accounting.seasonInvestment.seasonStartYear}
                {#if accounting.seasonInvestment.category}
                    · {accounting.seasonInvestment.category}
                {/if}
                {#if accounting.seasonInvestment.row}
                    · Row {accounting.seasonInvestment.row}
                {/if}
                {#if accounting.seasonInvestment.seat}
                    · Seat {accounting.seasonInvestment.seat}
                {/if}
            </p>
        {:else if tab !== 'all-time'}
            <p class="mt-4 text-xs text-ink-muted">
                No season pass recorded.
                <a
                    href="/season?year={data.year ?? new Date().getFullYear()}"
                    class="text-primary font-medium hover:text-primary-hover hover:underline"
                    >Set it on the Season tab.</a
                >
            </p>
        {/if}
    </section>

    {#if tab !== 'all-time'}
        {@const amortYear =
            tab === 'season' && data.year
                ? data.year
                : new Date().getMonth() < 7
                  ? new Date().getFullYear() - 1
                  : new Date().getFullYear()}
        {#await data.amortization}
            <AmortizationCardSkeleton />
        {:then amortization}
            {#if amortization}
                <AmortizationCard data={amortization} seasonStartYear={amortYear} />
            {/if}
        {:catch}
            <!-- amortization is non-critical; net section already errored or will -->
        {/await}
    {/if}
    </div>

    {#if accounting.leadTime && accounting.leadTime.soldCount >= 3}
        <div class="mb-6">
            <LeadTimeStrip data={accounting.leadTime} />
        </div>
    {/if}

    <div class="mb-4">
        <AccountingCard
            title="Realized"
            data={accounting.realized}
            {showSeason}
            showDate={!showSeason}
        />
    </div>
    <div class="grid sm:grid-cols-2 gap-4">
        <AccountingCard
            title="Unrealized"
            subtitle="Cancelled, won't settle."
            data={accounting.unrealized}
            {showSeason}
            variant="compact"
            tone="sunk"
        />
        <AccountingCard
            title="Pending"
            subtitle="Listed, awaiting sale."
            data={accounting.pending}
            {showSeason}
            variant="compact"
            tone="warning"
        />
    </div>
    </div>
{:catch err}
    <p
        role="alert"
        class="rounded-lg border border-negative bg-negative/5 text-negative-strong text-sm px-4 py-3"
    >
        Failed to load accounting: {err?.message ?? 'unknown error'}
    </p>
{/await}
