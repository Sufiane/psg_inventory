<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { page } from '$app/state';
    import { fade } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import AskCard from '$lib/ui/AskCard.svelte';
    import BreakEvenBar from '$lib/ui/BreakEvenBar.svelte';
    import Button from '$lib/ui/Button.svelte';
    import MathBlock from '$lib/ui/MathBlock.svelte';
    import NetProfitSkeleton from '$lib/ui/NetProfitSkeleton.svelte';
    import RecentSales from '$lib/ui/RecentSales.svelte';
    import Skeleton from '$lib/ui/Skeleton.svelte';
    import { money, signedMoney } from '$lib/format';
    import { breakEvenCaption, netTone, recentSales } from '$lib/dashboard';
    import { cancelledFrom } from '$lib/sale-math';
    import { carrySeason, seasonLabel } from '$lib/season';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const askAnswer = $derived(form && 'answer' in form ? form.answer : null);
    const askMessage = $derived(form && 'message' in form ? form.message : null);
    const askQuestion = $derived(
        askAnswer ? askAnswer.question : form && 'question' in form ? form.question : '',
    );
</script>

{#snippet failure(thing: string, err: { message?: string } | null)}
    <p
        role="alert"
        class="rounded-lg border border-negative bg-negative/5 text-negative-strong text-sm px-4 py-3"
    >
        Failed to load {thing}: {err?.message ?? 'unknown error'}
    </p>
{/snippet}

<div class="flex flex-wrap items-end justify-between gap-3 mb-6">
    <div>
        <h1 class="text-2xl font-semibold tracking-tight text-ink">Dashboard</h1>
        <p class="text-sm text-ink-muted">{seasonLabel(data.season)}</p>
    </div>

    <Button href="/sales/new">Log sale</Button>
</div>

{#await data.accounting}
    <NetProfitSkeleton />

    <div class="grid gap-4 sm:grid-cols-3 mb-6">
        {#each Array(3) as _, i (i)}
            <div class="bg-surface rounded-lg border border-line p-4 space-y-2">
                <Skeleton width="40%" height="0.85rem" />
                <Skeleton width="60%" height="1.5rem" />
                <Skeleton width="30%" height="0.75rem" />
            </div>
        {/each}
    </div>
{:then accounting}
    {@const realizedProceeds = accounting.realized?.totalProfit ?? 0}
    {@const realizedInvest = accounting.realized?.totalInvest ?? 0}
    {@const seasonInvest = accounting.totalSeasonInvestment}
    {@const hasPass = accounting.seasonInvestments.length > 0}
    {@const netProfit = realizedProceeds - realizedInvest - seasonInvest}
    {@const cancelled = cancelledFrom(accounting.unrealized, accounting.gifted)}
    {@const giftedCount = accounting.gifted?.totalSales ?? 0}
    {@const pendingCount = accounting.pending?.totalSales ?? 0}

    <section
        in:fade={{ duration: 120, easing: cubicOut }}
        class="bg-surface rounded-lg border border-line p-6 mb-6"
        aria-labelledby="dashboard-net-heading"
    >
        <h2 id="dashboard-net-heading" class="text-sm font-medium text-ink-muted">
            Net realized profit
        </h2>
        <p
            class="mt-1 mb-5 font-mono text-5xl font-semibold tracking-tight {netTone(
                netProfit,
            )}"
            data-numeric
        >
            {signedMoney(netProfit)}
        </p>

        <div class="max-w-md">
            <MathBlock
                lines={[
                    {
                        label: 'Realized proceeds (SOLD)',
                        value: realizedProceeds,
                        sign: 'plus',
                    },
                    { label: 'Ticket invest', value: realizedInvest, sign: 'minus' },
                    ...(hasPass
                        ? [
                              {
                                  label: 'Season pass',
                                  value: seasonInvest,
                                  sign: 'minus' as const,
                              },
                          ]
                        : []),
                ]}
                resultLabel="Net realized profit"
                result={netProfit}
            />
        </div>

        {#if !hasPass}
            <p class="mt-4 text-xs text-ink-muted">
                No season pass recorded.
                <a
                    href={carrySeason('/season', page.url)}
                    class="text-primary font-medium hover:text-primary-hover hover:underline"
                    >Set it on the Season tab.</a
                >
            </p>
        {/if}
    </section>

    <div in:fade={{ duration: 120, easing: cubicOut }} class="grid gap-4 sm:grid-cols-3 mb-6">
        <section
            class="bg-surface rounded-lg border border-line p-4"
            aria-labelledby="dashboard-pending-heading"
        >
            <h2
                id="dashboard-pending-heading"
                class="text-sm font-medium text-warning-strong"
            >
                Pending
            </h2>
            <p class="mt-1 font-mono text-xl font-semibold text-warning-strong" data-numeric>
                {money(accounting.pending?.totalProfit ?? 0)}
            </p>
            <p class="text-xs text-ink-muted">
                {pendingCount}
                {pendingCount === 1 ? 'sale' : 'sales'}
            </p>
        </section>

        <section
            class="bg-surface rounded-lg border border-line p-4"
            aria-labelledby="dashboard-cancelled-heading"
        >
            <h2
                id="dashboard-cancelled-heading"
                class="text-sm font-medium text-sunk-strong"
            >
                Cancelled
            </h2>
            <p class="mt-1 font-mono text-xl font-semibold text-sunk-strong" data-numeric>
                {money(cancelled.amount)}
            </p>
            <p class="text-xs text-ink-muted">
                {cancelled.count}
                {cancelled.count === 1 ? 'sale' : 'sales'}
            </p>
        </section>

        <section
            class="bg-surface rounded-lg border border-line p-4"
            aria-labelledby="dashboard-gifted-heading"
        >
            <h2 id="dashboard-gifted-heading" class="text-sm font-medium text-gift-strong">
                Gifted
            </h2>
            <p class="mt-1 font-mono text-xl font-semibold text-gift-strong" data-numeric>
                {giftedCount}
            </p>
            <p class="text-xs text-ink-muted">
                {giftedCount === 1 ? 'sale' : 'sales'}
            </p>
        </section>
    </div>
{:catch err}
    <div class="mb-6">
        {@render failure('accounting', err)}
    </div>
{/await}

<section
    class="bg-surface rounded-lg border border-line p-5 mb-6"
    aria-labelledby="dashboard-breakeven-heading"
>
    <h2
        id="dashboard-breakeven-heading"
        class="text-base font-semibold tracking-tight text-ink mb-3"
    >
        Season pass recovery
    </h2>

    {#await data.amortization}
        <Skeleton height="0.5rem" rounded="rounded-full" />
        <div class="mt-3"><Skeleton width="40%" height="0.85rem" /></div>
    {:then amortization}
        {@const caption = breakEvenCaption(amortization)}
        <div in:fade={{ duration: 120, easing: cubicOut }}>
            <BreakEvenBar progress={amortization.progress} hasPass={amortization.hasPass} />
            {#if caption}
                <p class="mt-2 text-sm text-ink-muted">{caption}</p>
            {/if}
        </div>
    {:catch err}
        {@render failure('season pass recovery', err)}
    {/await}
</section>

<section
    class="bg-surface rounded-lg border border-line p-5 mb-6"
    aria-labelledby="dashboard-recent-heading"
>
    <h2
        id="dashboard-recent-heading"
        class="text-base font-semibold tracking-tight text-ink mb-3"
    >
        Recent sales
    </h2>

    {#await data.sales}
        <ul class="divide-y divide-line">
            {#each Array(5) as _, i (i)}
                <li class="py-3 flex items-center gap-3">
                    <span class="flex-1"><Skeleton width="50%" height="0.85rem" /></span>
                    <Skeleton width="4rem" height="1.25rem" />
                    <Skeleton width="5rem" height="0.85rem" />
                </li>
            {/each}
        </ul>
    {:then sales}
        <div in:fade={{ duration: 120, easing: cubicOut }}>
            <RecentSales sales={recentSales(sales, 5)} />
        </div>
    {:catch err}
        {@render failure('recent sales', err)}
    {/await}
</section>

<AskCard answer={askAnswer} message={askMessage} question={askQuestion} />
