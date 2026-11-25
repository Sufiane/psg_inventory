<script lang="ts">
    import { page } from '$app/state';
    import { buildGeometry, type ChartBox } from '$lib/chart-geometry';
    import { money, shortDate } from '$lib/format';
    import { carrySeason } from '$lib/season';
    import type { ProceedsSeries } from '$lib/season-stats';

    let {
        series,
        passPrice,
        hasPass,
    }: { series: ProceedsSeries; passPrice: number; hasPass: boolean } = $props();

    const box: ChartBox = { width: 640, height: 240, left: 56, right: 16, top: 12, bottom: 28 };
    const LABEL_EDGE = 120;

    const geometry = $derived(buildGeometry(series, passPrice, box));

    const summary = $derived(
        `Cumulative sold proceeds ${money(series.total)}` +
            (hasPass ? ` against season pass ${money(passPrice)}` : '') +
            (series.breakEven ? `, break-even on ${shortDate(series.breakEven.at)}` : ''),
    );

    const markerLabel = $derived.by(() => {
        if (!geometry?.breakEven || !series.breakEven) {
            return null;
        }

        const nearEdge = geometry.breakEven.x > box.width - box.right - LABEL_EDGE;

        return {
            x: geometry.breakEven.x + (nearEdge ? -10 : 10),
            y: geometry.breakEven.y + 18,
            anchor: nearEdge ? 'end' : 'start',
            text: `Break-even, ${shortDate(series.breakEven.at)}`,
        };
    });
</script>

{#if geometry === null}
    <p class="text-sm text-ink-muted">No sold sales with a sold date yet.</p>
{:else}
    <svg viewBox="0 0 {box.width} {box.height}" role="img" aria-label={summary} class="w-full h-auto">
        {#each geometry.yTicks as tick (tick.value)}
            <line
                x1={geometry.plot.x0}
                x2={geometry.plot.x1}
                y1={tick.y}
                y2={tick.y}
                class="stroke-line"
                stroke-width="1"
            />
            <text
                x={geometry.plot.x0 - 8}
                y={tick.y}
                dominant-baseline="middle"
                text-anchor="end"
                class="fill-ink-faint font-mono text-[10px]"
            >
                {money(tick.value)}
            </text>
        {/each}

        {#each geometry.xTicks as tick, index (index)}
            <text
                x={tick.x}
                y={box.height - 8}
                text-anchor={geometry.xTicks.length === 1
                    ? 'middle'
                    : index === 0
                      ? 'start'
                      : 'end'}
                class="fill-ink-faint font-mono text-[10px]"
            >
                {shortDate(tick.at)}
            </text>
        {/each}

        <path d={geometry.linePath} fill="none" class="stroke-positive" stroke-width="2" />

        {#if geometry.passY !== null}
            <line
                x1={geometry.plot.x0}
                x2={geometry.plot.x1}
                y1={geometry.passY}
                y2={geometry.passY}
                class="stroke-warning"
                stroke-width="1.5"
                stroke-dasharray="6 4"
            />
            <text
                x={geometry.plot.x1}
                y={geometry.passY - 6}
                text-anchor="end"
                class="fill-warning-strong font-mono text-[10px]"
            >
                Season pass {money(passPrice)}
            </text>
        {/if}

        {#if geometry.breakEven && markerLabel}
            <circle
                cx={geometry.breakEven.x}
                cy={geometry.breakEven.y}
                r="5"
                class="fill-positive stroke-surface"
                stroke-width="2"
            />
            <text
                x={markerLabel.x}
                y={markerLabel.y}
                text-anchor={markerLabel.anchor}
                class="fill-ink font-mono text-[10px]"
            >
                {markerLabel.text}
            </text>
        {/if}
    </svg>

    <ul class="sr-only">
        <li>Cumulative sold proceeds: {money(series.total)}</li>
        {#if hasPass}
            <li>Season pass: {money(passPrice)}</li>
        {/if}
        {#if series.breakEven}
            <li>Break-even: {shortDate(series.breakEven.at)}</li>
        {:else if hasPass}
            <li>Break-even not reached</li>
        {/if}
    </ul>
{/if}

{#if series.undated > 0}
    <p class="mt-2 text-xs text-ink-muted">
        {series.undated} sold {series.undated === 1 ? 'sale has' : 'sales have'} no sold date and
        {series.undated === 1 ? 'is' : 'are'} not plotted.
    </p>
{/if}

{#if !hasPass}
    <p class="mt-2 text-xs text-ink-muted">
        No season pass recorded.
        <a
            href={carrySeason('/season', page.url)}
            class="text-primary font-medium hover:text-primary-hover hover:underline"
            >Set it on the Season tab.</a
        >
    </p>
{/if}
