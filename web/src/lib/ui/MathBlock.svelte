<script lang="ts">
    import { money } from '$lib/format';

    type Line = { label: string; value: number; sign?: 'plus' | 'minus' };

    let {
        lines,
        resultLabel,
        result,
    }: { lines: Line[]; resultLabel: string; result: number } = $props();

    const resultTone = $derived(result < 0 ? 'text-negative-strong' : 'text-ink');
</script>

<dl class="text-sm">
    {#each lines as line (line.label)}
        <div class="flex items-baseline justify-between gap-4 py-1">
            <dt class="text-ink-muted">
                {#if line.sign}
                    <span aria-hidden="true" class="inline-block w-4 text-ink-faint">
                        {line.sign === 'plus' ? '+' : '−'}
                    </span>
                    <span class="sr-only">{line.sign === 'plus' ? 'plus' : 'minus'}</span>
                {/if}
                {line.label}
            </dt>
            <dd class="font-mono text-ink" data-numeric>{money(line.value)}</dd>
        </div>
    {/each}
    <div
        class="flex items-baseline justify-between gap-4 border-t border-line-strong mt-1 pt-2"
    >
        <dt class="font-medium text-ink">
            <span aria-hidden="true" class="inline-block w-4 text-ink-faint">=</span>
            {resultLabel}
        </dt>
        <dd class="font-mono font-semibold {resultTone}" data-numeric>
            {money(result)}
        </dd>
    </div>
</dl>
