<script lang="ts">
    import type { LeadTime } from '$lib/types';

    let { data }: { data: LeadTime } = $props();

    function dayLabel(value: number): string {
        return `${value} d`;
    }
</script>

<section
    class="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-ink-muted px-1"
    aria-label="Sale lead-time summary"
>
    <span class="font-medium text-ink-muted">Lead time</span>

    <span class="flex items-baseline gap-1.5">
        <span>avg</span>
        <span class="font-mono text-ink" data-numeric>{dayLabel(data.avgLeadDays)}</span>
    </span>

    <span class="flex items-baseline gap-1.5">
        <span>median</span>
        <span class="font-mono text-ink" data-numeric
            >{dayLabel(data.medianLeadDays)}</span
        >
    </span>

    <span class="flex items-baseline gap-1.5">
        <span>range</span>
        <span class="font-mono text-ink" data-numeric>
            {data.minLeadDays}–{data.maxLeadDays} d
        </span>
    </span>

    <span class="text-ink-faint">
        across <span class="font-mono text-ink-muted" data-numeric>{data.soldCount}</span>
        sold {data.soldCount === 1 ? 'sale' : 'sales'}
    </span>
</section>
