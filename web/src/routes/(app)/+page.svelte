<script lang="ts">
    import type { PageData } from './$types';
    import AccountingCard from '$lib/ui/AccountingCard.svelte';
    import AccountingCardSkeleton from '$lib/ui/AccountingCardSkeleton.svelte';
    import Skeleton from '$lib/ui/Skeleton.svelte';
    import { competitionLabel, dateTime } from '$lib/format';

    let { data }: { data: PageData } = $props();
</script>

<h1 class="text-2xl font-semibold mb-6">Current season</h1>

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
