<script lang="ts">
    import type { Amortization } from '$lib/types';
    import { money, signedMoney, shortDate, competitionLabel } from '$lib/format';

    let {
        data,
        seasonStartYear,
    }: {
        data: Amortization;
        seasonStartYear: number;
    } = $props();

    const hasPass = $derived(data.hasPass && data.passPrice > 0);
    const cleared = $derived(hasPass && data.breakEven !== null);
    const noSales = $derived(data.perMatch.length === 0);
    const progressPct = $derived(Math.round(data.progress * 100));
</script>

<section
    class="bg-surface rounded-lg border border-line p-5 max-w-lg"
    aria-labelledby="amort-heading"
>
    <header class="flex items-baseline justify-between gap-3">
        <h2 id="amort-heading" class="text-sm font-medium text-ink-muted">
            Season pass amortization
        </h2>
        <span class="text-xs text-ink-faint">Season {seasonStartYear}</span>
    </header>

    {#if !hasPass}
        <p class="mt-3 text-sm text-ink">Season pass unset.</p>
        <p class="mt-1 text-xs text-ink-muted">
            <a
                href="/season?year={seasonStartYear}"
                class="text-primary font-medium hover:text-primary-hover hover:underline"
                >Set the pass price</a
            > to see this season's break-even.
        </p>
    {:else}
        {@const headlineValue = cleared ? data.surplus : data.remaining}
        {@const headlineLabel = cleared ? 'Surplus over pass' : 'Remaining to clear'}
        {@const headlineTone = cleared
            ? 'text-positive-strong'
            : noSales
              ? 'text-ink'
              : 'text-warning-strong'}

        <p
            class="mt-1 font-mono text-3xl font-semibold tracking-tight {headlineTone}"
            data-numeric
            aria-label="{headlineLabel}: {money(headlineValue)}"
        >
            {cleared ? '+' : ''}{money(headlineValue)}
        </p>
        <p class="mt-0.5 text-xs text-ink-muted">{headlineLabel}</p>

        <div class="mt-5">
            <div
                class="h-1.5 rounded-full bg-surface-strong overflow-hidden"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={progressPct}
                aria-label="Pass amortization progress"
            >
                <div
                    class="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none {cleared
                        ? 'bg-positive'
                        : 'bg-warning'}"
                    style="width: {progressPct}%"
                ></div>
            </div>

            <dl
                class="mt-2 flex items-baseline justify-between gap-3 text-xs text-ink-muted"
            >
                <div class="flex items-baseline gap-1.5">
                    <dt class="sr-only">Realized so far</dt>
                    <dd class="font-mono text-ink" data-numeric>
                        {money(data.totalRealized)}
                    </dd>
                    <span class="text-ink-faint">of</span>
                    <dt class="sr-only">Pass price</dt>
                    <dd class="font-mono" data-numeric>{money(data.passPrice)}</dd>
                </div>
                <div class="font-mono tabular-nums" data-numeric>{progressPct}%</div>
            </dl>
        </div>

        <p class="mt-4 text-xs text-ink-muted leading-relaxed">
            {#if noSales}
                No realized sales yet this season.
            {:else if cleared && data.breakEven}
                Cleared at <span class="text-ink font-medium"
                    >{data.breakEven.opponent}</span
                >
                on
                <span class="text-ink font-medium">{shortDate(data.breakEven.date)}</span
                >.
            {:else}
                {money(data.remaining)} to clear the pass at current realized profit.
            {/if}
        </p>

        {#if data.perMatch.length > 0}
            <details class="mt-4 group">
                <summary
                    class="cursor-pointer text-xs text-ink-muted hover:text-ink select-none flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary rounded"
                >
                    <span
                        class="inline-block transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
                        aria-hidden="true">›</span
                    >
                    Match-by-match progress ({data.perMatch.length})
                </summary>

                <ol
                    class="mt-3 divide-y divide-line border-y border-line"
                    aria-label="Per-match cumulative realized profit"
                >
                    {#each data.perMatch as row (row.matchId)}
                        <li
                            class="flex items-baseline gap-3 py-2 text-xs {row.isBreakEven
                                ? 'bg-positive/5 -mx-5 px-5'
                                : ''}"
                        >
                            <span
                                class="w-10 shrink-0 text-ink-faint font-mono"
                                data-numeric
                            >
                                {shortDate(row.date)}
                            </span>
                            <span class="flex-1 min-w-0 truncate text-ink">
                                {row.opponent}
                                <span class="text-ink-faint"
                                    >· {competitionLabel(row.competition)}</span
                                >
                                {#if row.isBreakEven}
                                    <span
                                        class="ml-1 text-positive-strong font-medium"
                                        aria-label="Break-even match">★ break-even</span
                                    >
                                {/if}
                            </span>
                            <span
                                class="w-20 shrink-0 text-right font-mono {row.matchProfit >
                                0
                                    ? 'text-positive'
                                    : row.matchProfit < 0
                                      ? 'text-negative'
                                      : 'text-ink-muted'}"
                                data-numeric
                            >
                                {signedMoney(row.matchProfit)}
                            </span>
                            <span
                                class="w-20 shrink-0 text-right font-mono text-ink"
                                data-numeric
                                aria-label="Cumulative {money(row.cumulative)}"
                            >
                                {money(row.cumulative)}
                            </span>
                        </li>
                    {/each}
                </ol>
                <p class="mt-2 text-[0.65rem] text-ink-faint leading-snug">
                    Columns: date · match · profit · cumulative. Only realized (sold) sales
                    are counted.
                </p>
            </details>
        {/if}
    {/if}
</section>
