<script lang="ts">
    import type { StripSegment } from '$lib/accounting-view';
    import type { SaleStatus } from '$lib/types';
    import { upcomingIndex } from '$lib/accounting-view';
    import { shortDate } from '$lib/format';

    let { segments }: { segments: StripSegment[] } = $props();

    let scroller: HTMLDivElement | undefined = $state();
    let hasMoreBefore = $state(false);
    let hasMoreAfter = $state(false);

    function updateFades(): void {
        if (!scroller) {
            return;
        }

        hasMoreBefore = scroller.scrollLeft > 1;
        hasMoreAfter = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
    }

    $effect(() => {
        if (!scroller) {
            return;
        }

        const index = upcomingIndex(segments, new Date());
        const card = scroller.querySelectorAll<HTMLElement>('ol > li')[index];

        if (card) {
            scroller.scrollLeft = card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2;
        }

        updateFades();
    });

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

<svelte:window onresize={updateFades} />

{#if segments.length > 0}
    <div class="relative">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
            bind:this={scroller}
            onscroll={updateFades}
            role="region"
            aria-label="Matchday strip scroller"
            tabindex="0"
            class="relative snap-x snap-proximity overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
            <ol aria-label="Matchday strip" class="flex w-max gap-2">
                {#each segments as segment (segment.matchId)}
                    {@const label = `${segment.opponent}, ${shortDate(segment.date)}, ${segment.status ?? 'no sale'}${segment.isBreakEven ? ', break-even' : ''}`}
                    <li class="w-24 shrink-0 snap-start" aria-label={label} title={label}>
                        <span
                            class="flex h-7 items-center justify-center rounded-sm {fillFor(
                                segment.status,
                            )}"
                            aria-hidden="true"
                        >
                            {#if segment.isBreakEven}<span class="text-surface-subtle">★</span>{/if}
                        </span>
                        <span class="mt-1 block text-xs text-ink-faint">
                            {shortDate(segment.date)}
                        </span>
                        <span class="block text-xs text-ink line-clamp-2 break-words">
                            {segment.opponent}
                        </span>
                    </li>
                {/each}
            </ol>
        </div>
        <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-y-0 left-0 bottom-2 w-10 bg-linear-to-r from-surface-subtle to-transparent transition-opacity motion-reduce:transition-none {hasMoreBefore
                ? 'opacity-100'
                : 'opacity-0'}"
        ></div>
        <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-y-0 right-0 bottom-2 w-10 bg-linear-to-l from-surface-subtle to-transparent transition-opacity motion-reduce:transition-none {hasMoreAfter
                ? 'opacity-100'
                : 'opacity-0'}"
        ></div>
    </div>

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
