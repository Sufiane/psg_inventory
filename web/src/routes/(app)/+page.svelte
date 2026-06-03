<script lang="ts">
    import type { PageData } from './$types';
    import AccountingCard from '$lib/ui/AccountingCard.svelte';
    import AccountingCardSkeleton from '$lib/ui/AccountingCardSkeleton.svelte';
    import NetProfitSkeleton from '$lib/ui/NetProfitSkeleton.svelte';
    import Skeleton from '$lib/ui/Skeleton.svelte';
    import { competitionLabel, dateTime, money } from '$lib/format';

    let { data }: { data: PageData } = $props();
</script>

<h1 class="text-2xl font-semibold mb-6">Current season</h1>

{#await data.accounting}
    <NetProfitSkeleton />
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

            <dt class="text-slate-500">Ticket invest</dt>
            <dd class="text-right font-mono text-slate-700">−{money(realizedInvest)}</dd>

            <dt class="text-slate-500">Season investment</dt>
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
        {:else}
            <p class="mt-3 text-xs text-slate-500">
                No season pass recorded.
                <a href="/season" class="text-blue-600 hover:underline"
                    >Set it on the Season tab.</a
                >
            </p>
        {/if}
    </section>
{:catch}
    <!-- error is shown in the cards block below -->
{/await}

<div class="grid md:grid-cols-3 gap-4 mb-8">
    {#await data.accounting}
        <AccountingCardSkeleton title="Realized" />
        <AccountingCardSkeleton title="Unrealized" />
        <AccountingCardSkeleton title="Pending" />
    {:then accounting}
        <AccountingCard title="Realized" data={accounting.realized} />
        <AccountingCard title="Unrealized" data={accounting.unrealized} />
        <AccountingCard title="Pending" data={accounting.pending} />
    {:catch err}
        <p
            class="md:col-span-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2"
        >
            Failed to load accounting: {err?.message ?? 'unknown error'}
        </p>
    {/await}
</div>

<section class="bg-white rounded-lg border border-slate-200 p-4">
    <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Upcoming matches
    </h2>

    {#await data.matches}
        <ul class="divide-y divide-slate-100">
            {#each Array(3) as _, i (i)}
                <li class="py-2 flex items-center gap-3 text-sm">
                    <Skeleton width="8rem" height="0.85rem" />
                    <span class="flex-1"><Skeleton width="60%" height="0.85rem" /></span>
                    <Skeleton width="5rem" height="0.75rem" />
                </li>
            {/each}
        </ul>
    {:then matches}
        {@const upcoming = matches
            .filter((match) => new Date(match.date) >= new Date())
            .slice(0, 5)}
        {#if upcoming.length === 0}
            <p class="text-slate-400 text-sm">No upcoming matches.</p>
        {:else}
            <ul class="divide-y divide-slate-100">
                {#each upcoming as match (match.id)}
                    <li class="py-2 flex items-center gap-3 text-sm">
                        <span class="w-32 text-slate-500">{dateTime(match.date)}</span>
                        <span class="flex-1">
                            {match.atHome ? 'vs' : '@'}
                            <strong>{match.opponent}</strong>
                        </span>
                        <span class="text-slate-400 text-xs"
                            >{competitionLabel(match.competition)}</span
                        >
                        <a href="/matches/{match.id}" class="text-blue-600 hover:underline"
                            >View</a
                        >
                    </li>
                {/each}
            </ul>
        {/if}
    {:catch err}
        <p class="text-red-700 text-sm">
            Failed to load matches: {err?.message ?? 'unknown error'}
        </p>
    {/await}
</section>
