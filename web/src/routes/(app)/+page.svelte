<script lang="ts">
    import type { PageData } from './$types';
    import { fade } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import AccountingCard from '$lib/ui/AccountingCard.svelte';
    import AccountingCardSkeleton from '$lib/ui/AccountingCardSkeleton.svelte';
    import NetProfitSkeleton from '$lib/ui/NetProfitSkeleton.svelte';
    import Skeleton from '$lib/ui/Skeleton.svelte';
    import { competitionLabel, dateTime, signedMoney } from '$lib/format';

    let { data }: { data: PageData } = $props();
</script>

<h1 class="text-2xl font-semibold tracking-tight text-ink mb-6">Current season</h1>

{#await data.accounting}
    <NetProfitSkeleton />
{:then accounting}
    {@const realizedProceeds = accounting.realized?.totalProfit ?? 0}
    {@const realizedInvest = accounting.realized?.totalInvest ?? 0}
    {@const seasonInvest = accounting.totalSeasonInvestment}
    {@const netProfit = realizedProceeds - realizedInvest - seasonInvest}

    <section
        in:fade={{ duration: 120, easing: cubicOut }}
        class="bg-surface rounded-lg border border-line p-5 mb-6 max-w-lg"
        aria-labelledby="dashboard-net-heading"
    >
        <h2 id="dashboard-net-heading" class="text-sm font-medium text-ink-muted">
            Net realized profit
        </h2>
        <p
            class="mt-1 font-mono text-3xl font-semibold tracking-tight {netProfit < 0
                ? 'text-negative-strong'
                : 'text-positive-strong'}"
            aria-live="polite"
        >
            {signedMoney(netProfit)}
        </p>

        <dl class="mt-5 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <dt class="text-ink-muted">Realized proceeds</dt>
            <dd
                class="text-right font-mono {realizedProceeds < 0
                    ? 'text-negative'
                    : 'text-positive'}"
            >
                {signedMoney(realizedProceeds)}
            </dd>

            <dt class="text-ink-muted">Ticket invest</dt>
            <dd class="text-right font-mono text-ink-muted">
                {signedMoney(-realizedInvest)}
            </dd>

            <dt class="text-ink-muted">Season investment</dt>
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
        {:else}
            <p class="mt-4 text-xs text-ink-muted">
                No season pass recorded.
                <a
                    href="/season"
                    class="text-primary font-medium hover:text-primary-hover hover:underline"
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
        <div in:fade={{ duration: 120, easing: cubicOut }}>
            <AccountingCard title="Realized" data={accounting.realized} />
        </div>
        <div in:fade={{ duration: 140, easing: cubicOut, delay: 30 }}>
            <AccountingCard
                title="Unrealized"
                data={accounting.unrealized}
                tone="sunk"
            />
        </div>
        <div in:fade={{ duration: 160, easing: cubicOut, delay: 60 }}>
            <AccountingCard title="Pending" data={accounting.pending} tone="warning" />
        </div>
    {:catch err}
        <p
            role="alert"
            class="md:col-span-3 rounded-lg border border-negative bg-negative/5 text-negative-strong text-sm px-4 py-3"
        >
            Failed to load accounting: {err?.message ?? 'unknown error'}
        </p>
    {/await}
</div>

<section class="bg-surface rounded-lg border border-line p-5">
    <h2 class="text-base font-semibold tracking-tight text-ink mb-4">
        Upcoming matches
    </h2>

    {#await data.matches}
        <ul class="divide-y divide-line">
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
            <p
                in:fade={{ duration: 120, easing: cubicOut }}
                class="text-ink-faint text-sm"
            >
                No upcoming matches.
            </p>
        {:else}
            <ul
                in:fade={{ duration: 120, easing: cubicOut }}
                class="divide-y divide-line"
            >
                {#each upcoming as match (match.id)}
                    <li class="py-2 flex items-center gap-3 text-sm">
                        <span class="w-32 text-ink-muted">{dateTime(match.date)}</span>
                        <span class="flex-1 text-ink">
                            {match.atHome ? 'vs' : '@'}
                            <strong>{match.opponent}</strong>
                        </span>
                        <span class="text-ink-faint text-xs"
                            >{competitionLabel(match.competition)}</span
                        >
                        <a
                            href="/matches/{match.id}"
                            class="text-primary font-medium hover:text-primary-hover hover:underline"
                            >View</a
                        >
                    </li>
                {/each}
            </ul>
        {/if}
    {:catch err}
        <p role="alert" class="text-negative-strong text-sm">
            Failed to load matches: {err?.message ?? 'unknown error'}
        </p>
    {/await}
</section>
