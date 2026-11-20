<script lang="ts">
    import type { StripSegment } from '$lib/accounting-view';
    import type { SaleStatus } from '$lib/types';
    import { shortDate } from '$lib/format';

    let { segments }: { segments: StripSegment[] } = $props();

    function fillFor(status: SaleStatus | null): string {
        if (status === 'SOLD') {
            return 'bg-positive';
        }

        if (status === 'PENDING') {
            return 'bg-warning';
        }

        if (status === 'CANCELLED') {
            return 'bg-[#6e5d6d]';
        }

        if (status === 'GIFTED') {
            return 'bg-gift';
        }

        return 'bg-line-strong';
    }
</script>

{#if segments.length > 0}
    <ol aria-label="Matchday strip" class="flex gap-1">
        {#each segments as segment (segment.matchId)}
            {@const label = `${segment.opponent}, ${shortDate(segment.date)}, ${segment.status ?? 'no sale'}${segment.isBreakEven ? ', break-even' : ''}`}
            <li class="flex-1 min-w-0" aria-label={label} title={label}>
                <span
                    class="flex h-7 items-center justify-center rounded-sm {fillFor(
                        segment.status,
                    )}"
                    aria-hidden="true"
                >
                    {#if segment.isBreakEven}<span class="text-surface-subtle">★</span>{/if}
                </span>
                <span class="mt-1 hidden truncate text-center text-xs sm:block text-ink-faint">
                    {shortDate(segment.date)}
                </span>
            </li>
        {/each}
    </ol>

    <ul aria-hidden="true" class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-faint">
        <li class="flex items-center gap-1">
            <span class="h-3 w-6 rounded-sm bg-positive"></span>Sold
        </li>
        <li class="flex items-center gap-1">
            <span class="h-3 w-6 rounded-sm bg-warning"></span>Pending
        </li>
        <li class="flex items-center gap-1">
            <span class="h-3 w-6 rounded-sm bg-gift"></span>Gifted
        </li>
        <li class="flex items-center gap-1">
            <span class="h-3 w-6 rounded-sm bg-[#6e5d6d]"></span>Cancelled
        </li>
        <li class="flex items-center gap-1">
            <span class="h-3 w-6 rounded-sm bg-line-strong"></span>No sale
        </li>
        <li class="flex items-center gap-1"><span aria-hidden="true">★</span> break-even</li>
    </ul>
{/if}
