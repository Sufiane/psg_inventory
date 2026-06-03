<script lang="ts">
    import type { PageData } from './$types';
    import AccountingCard from '$lib/ui/AccountingCard.svelte';
    import AccountingCardSkeleton from '$lib/ui/AccountingCardSkeleton.svelte';
    import NetProfitSkeleton from '$lib/ui/NetProfitSkeleton.svelte';
    import { money } from '$lib/format';

    let { data }: { data: PageData } = $props();

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

    let tab = $derived(data.view);
</script>

<h1 class="text-2xl font-semibold mb-6">Accounting</h1>

<div class="flex items-center gap-2 mb-6">
    <a
        href="/accounting?view=current"
        class="px-3 py-1.5 text-sm rounded border {tab === 'current'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'border-slate-300 text-slate-700'}"
    >
        Current season
    </a>
    <a
        href="/accounting?view=all-time"
        class="px-3 py-1.5 text-sm rounded border {tab === 'all-time'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'border-slate-300 text-slate-700'}"
    >
        All time
    </a>

    <form method="GET" class="flex items-center gap-2 ml-2">
        <input type="hidden" name="view" value="season" />
        <select
            name="year"
            class="rounded border border-slate-300 px-2 py-1 text-sm"
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
        >
            <option value="">Pick season…</option>
            {#each years as year (year)}
                <option value={year} selected={data.year === year}>{year}</option>
            {/each}
        </select>
    </form>
</div>

{#await data.accounting}
    <NetProfitSkeleton />
    <div class="grid md:grid-cols-3 gap-4">
        <AccountingCardSkeleton title="Realized" />
        <AccountingCardSkeleton title="Unrealized" />
        <AccountingCardSkeleton title="Pending" />
    </div>
{:then accounting}
    {@const realizedProceeds = accounting.realized?.totalProfit ?? 0}
    {@const realizedInvest = accounting.realized?.totalInvest ?? 0}
    {@const seasonInvest = accounting.totalSeasonInvestment}
    {@const netProfit = realizedProceeds - realizedInvest - seasonInvest}

    <section class="bg-white rounded-lg border border-slate-200 p-4 mb-6">
        <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Net realized profit
        </h2>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm max-w-md">
            <dt class="text-slate-500">Realized proceeds</dt>
            <dd
                class="text-right font-mono {realizedProceeds < 0
                    ? 'text-red-600'
                    : 'text-emerald-600'}"
            >
                {money(realizedProceeds)}
            </dd>

            <dt class="text-slate-500">
                Ticket invest{tab === 'all-time' ? ' (all time)' : ''}
            </dt>
            <dd class="text-right font-mono text-slate-700">−{money(realizedInvest)}</dd>

            <dt class="text-slate-500">
                Season investment{tab === 'all-time' ? ' (all seasons)' : ''}
            </dt>
            <dd class="text-right font-mono text-slate-700">−{money(seasonInvest)}</dd>

            <dt class="text-slate-900 font-medium pt-2 border-t border-slate-100">
                Net
            </dt>
            <dd
                class="text-right pt-2 border-t border-slate-100 font-mono font-semibold {netProfit <
                0
                    ? 'text-red-600'
                    : 'text-emerald-600'}"
            >
                {money(netProfit)}
            </dd>
        </dl>

        {#if accounting.seasonInvestment}
            <p class="mt-3 text-xs text-slate-500">
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
            <p class="mt-3 text-xs text-slate-500">
                No season pass recorded.
                <a
                    href="/season?year={data.year ?? new Date().getFullYear()}"
                    class="text-blue-600 hover:underline">Set it on the Season tab.</a
                >
            </p>
        {/if}
    </section>

    {@const showSeason = tab === 'all-time'}

    <div class="grid md:grid-cols-3 gap-4">
        <AccountingCard title="Realized" data={accounting.realized} {showSeason} />
        <AccountingCard title="Unrealized" data={accounting.unrealized} {showSeason} />
        <AccountingCard title="Pending" data={accounting.pending} {showSeason} />
    </div>
{:catch err}
    <p class="rounded bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
        Failed to load accounting: {err?.message ?? 'unknown error'}
    </p>
{/await}
