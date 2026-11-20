<script lang="ts">
    import type { Amortization } from '$lib/types';
    import { page } from '$app/state';
    import { passCostPerMatch } from '$lib/accounting-view';
    import BreakEvenBar from '$lib/ui/BreakEvenBar.svelte';
    import { money, shortDate } from '$lib/format';
    import { carrySeason } from '$lib/season';

    let { data, matchCount }: { data: Amortization; matchCount: number } = $props();

    const hasPass = $derived(data.hasPass && data.passPrice > 0);
    const cleared = $derived(hasPass && data.breakEven !== null);
    const noSales = $derived(data.perMatch.length === 0);
    const headlineValue = $derived(cleared ? data.surplus : data.remaining);
    const headlineLabel = $derived(cleared ? 'Surplus over pass' : 'Remaining to clear');
    const headlineTone = $derived(
        cleared ? 'text-positive-strong' : noSales ? 'text-ink' : 'text-warning-strong',
    );
</script>

<section
    class="bg-surface rounded-lg border border-line p-5 max-w-lg"
    aria-labelledby="amort-heading"
>
    <h2 id="amort-heading" class="text-sm font-medium text-ink-muted">
        Season pass per match
    </h2>

    {#if !hasPass}
        <p class="mt-3 text-sm text-ink">No season pass set.</p>
        <p class="mt-1 text-xs text-ink-muted">
            <a
                href={carrySeason('/season', page.url)}
                class="text-primary font-medium hover:text-primary-hover hover:underline"
                >Add one on the Season page</a
            >
        </p>
    {:else}
        {#if matchCount === 0}
            <p class="mt-3 text-sm text-ink">No fixtures in this season.</p>
        {:else}
            <p class="mt-3 flex flex-wrap items-baseline gap-1.5 text-sm text-ink">
                <span class="font-mono" data-numeric>{money(data.passPrice)}</span>
                <span class="sr-only">divided by</span>
                <span class="text-ink-faint" aria-hidden="true">÷</span>
                <span class="font-mono" data-numeric>{matchCount}</span>
                <span>fixtures</span>
                <span class="sr-only">equals</span>
                <span class="text-ink-faint" aria-hidden="true">=</span>
                <span class="font-mono font-semibold" data-numeric
                    >{money(passCostPerMatch(data.passPrice, matchCount))}</span
                >
            </p>
        {/if}

        <div class="mt-4">
            <BreakEvenBar progress={data.progress} hasPass={data.hasPass} />
        </div>

        <p
            class="mt-4 font-mono text-3xl font-semibold tracking-tight {headlineTone}"
            data-numeric
        >
            <span class="sr-only">{headlineLabel}: </span>{cleared ? '+' : ''}{money(headlineValue)}
        </p>
        <p class="mt-0.5 text-xs text-ink-muted" aria-hidden="true">{headlineLabel}</p>

        {#if cleared && data.breakEven}
            <p class="mt-3 text-xs text-ink-muted">
                Cleared at <span class="text-ink font-medium">{data.breakEven.opponent}</span>
                on
                <span class="text-ink font-medium">{shortDate(data.breakEven.date)}</span>.
            </p>
        {/if}
    {/if}
</section>
