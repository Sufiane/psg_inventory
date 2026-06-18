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

<div class="flex flex-wrap items-end justify-between gap-3 mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Current season</h1>

    <a
        href="/sales/new"
        class="rounded bg-primary text-surface px-3 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
    >
        New sale
    </a>
</div>

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
            class="mt-1 font-mono text-3xl font-semibold tracking-tight {netTone(
                netProfit,
            )}"
        >
            {signedMoney(netProfit)}
        </p>

        <dl class="mt-5 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <dt class="text-ink-muted">Realized proceeds</dt>
            <dd class="text-right font-mono {proceedsTone(realizedProceeds)}">
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

        {#if accounting.seasonInvestments.length > 0}
            <ul class="mt-4 space-y-1 text-xs text-ink-muted">
                {#each accounting.seasonInvestments as pass (pass.id)}
                    <li>
                        Season {pass.seasonStartYear} · {pass.label} · {pass.category}
                        · Row {pass.row} · Seat {pass.seat}
                    </li>
                {/each}
            </ul>
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
{/await}

<div class="grid sm:grid-cols-2 gap-4 mb-8 max-w-lg">
    {#await data.accounting}
        <AccountingCardSkeleton title="Unrealized" variant="compact" />
        <AccountingCardSkeleton title="Pending" variant="compact" />
    {:then accounting}
        <div in:fade={{ duration: 120, easing: cubicOut }}>
            <AccountingCard
                title="Unrealized"
                subtitle="Cancelled, won't settle."
                data={accounting.unrealized}
                variant="compact"
                tone="sunk"
            />
        </div>
        <div in:fade={{ duration: 120, easing: cubicOut }}>
            <AccountingCard
                title="Pending"
                subtitle="Listed, awaiting sale."
                data={accounting.pending}
                variant="compact"
                tone="warning"
            />
        </div>
    {:catch err}
        <p
            role="alert"
            class="sm:col-span-2 rounded-lg border border-negative bg-negative/5 text-negative-strong text-sm px-4 py-3"
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
                    <Skeleton width="9rem" height="0.85rem" />
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
                    <li>
                        <a
                            href="/matches/{match.id}"
                            class="py-2 flex items-center gap-3 text-sm hover:bg-surface-strong rounded-md px-2 -mx-2 transition-colors"
                        >
                            <span class="w-36 shrink-0 text-ink-muted"
                                >{dateTime(match.date)}</span
                            >
                            <span class="flex-1 min-w-0 text-ink truncate">
                                {match.atHome ? 'vs' : '@'}
                                <strong>{match.opponent}</strong>
                            </span>
                            <span class="text-ink-faint text-xs shrink-0"
                                >{competitionLabel(match.competition)}</span
                            >
                        </a>
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
