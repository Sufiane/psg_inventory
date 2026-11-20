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
    import { money, signedMoney } from '$lib/format';
    import { seasonStartYearFromDate } from '$lib/season';

    let { data }: { data: PageData } = $props();

    let tab = $derived(data.view);
</script>

<div class="flex flex-wrap items-end justify-between gap-4 mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Accounting</h1>
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

        {#if accounting.seasonInvestments.length > 0}
            <ul class="mt-4 space-y-1 text-xs text-ink-muted">
                {#each accounting.seasonInvestments as pass (pass.id)}
                    <li>
                        Season {pass.seasonStartYear} · {pass.label} · {pass.category}
                        · Row {pass.row} · Seat {pass.seat}
                    </li>
                {/each}
            </ul>
        {:else if tab !== 'all-time'}
            <p class="mt-4 text-xs text-ink-muted">
                No season pass recorded.
                <a
                    href="/season?year={data.year ?? seasonStartYearFromDate(new Date())}"
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
                : seasonStartYearFromDate(new Date())}
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
            subtitle="Cancelled, or given away."
            data={accounting.unrealized}
            footnote={accounting.gifted
                ? `of which gifted ${money(accounting.gifted.totalProfit)}`
                : undefined}
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
