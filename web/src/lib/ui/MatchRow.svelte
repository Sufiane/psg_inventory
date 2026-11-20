<script lang="ts">
    import { goto } from '$app/navigation';
    import { competitionLabel, dateTime, signedMoney } from '$lib/format';
    import { displayScore, matchSummary } from '$lib/matches-view';
    import type { FormattedMatch, SaleListItem, SaleStatus } from '$lib/types';
    import StatusChip from './StatusChip.svelte';

    type Props = {
        match: FormattedMatch;
        sales: SaleListItem[];
        selected: boolean;
        selectHref: string;
    };

    const DESKTOP_QUERY = '(min-width: 1024px)';

    const ACCENT: Record<SaleStatus | 'NONE', string> = {
        SOLD: 'bg-positive',
        PENDING: 'bg-warning',
        CANCELLED: 'bg-sunk-fill',
        GIFTED: 'bg-gift',
        NONE: 'bg-line',
    };

    let { match, sales, selected, selectHref }: Props = $props();

    const summary = $derived(matchSummary(sales));
    const score = $derived(displayScore(match));

    function select(event: MouseEvent): void {
        if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        ) {
            return;
        }

        if (!window.matchMedia(DESKTOP_QUERY).matches) {
            return;
        }

        event.preventDefault();
        void goto(selectHref, { noScroll: true, keepFocus: true });
    }
</script>

<li>
    <a
        href="/matches/{match.id}"
        onclick={select}
        aria-current={selected ? 'true' : undefined}
        class="relative flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 py-3 pl-5 pr-4 text-sm transition-colors duration-150 hover:bg-surface-strong/60 {selected
            ? 'bg-surface-strong'
            : ''}"
    >
        <span
            aria-hidden="true"
            class="absolute inset-y-0 left-0 w-1 {ACCENT[summary.status ?? 'NONE']}"
        ></span>

        <span class="w-36 shrink-0 text-ink-muted" data-numeric>{dateTime(match.date)}</span>

        <span class="min-w-0 flex-1 basis-40 truncate text-ink">
            <span class="text-ink-faint">{match.atHome ? 'vs' : '@'}</span>
            <strong class="font-semibold">{match.opponent}</strong>
        </span>

        <span
            class="shrink-0 rounded border border-line-strong px-2 py-0.5 text-xs text-ink-muted"
        >
            {competitionLabel(match.competition)}
        </span>

        {#if score}
            <span
                class="shrink-0 font-mono text-xs {match.result?.isWin
                    ? 'text-positive-strong'
                    : 'text-negative'}"
                data-numeric
            >
                {score}
                <span class="sr-only">{match.result?.isWin ? 'win' : 'loss or draw'}</span>
            </span>
        {/if}

        <span class="flex shrink-0 items-center gap-2 sm:w-52 sm:justify-end">
            {#if summary.status}
                {#if summary.tickets > 0}
                    <span class="text-xs text-ink-muted" data-numeric>
                        {summary.tickets}
                        {summary.tickets === 1 ? 'ticket' : 'tickets'}
                    </span>
                {/if}
                <StatusChip status={summary.status} />
                {#if summary.status === 'SOLD'}
                    <span
                        class="font-mono {summary.net < 0
                            ? 'text-negative'
                            : 'text-positive-strong'}"
                        data-numeric>{signedMoney(summary.net)}</span
                    >
                {/if}
            {:else}
                <span class="text-xs text-ink-faint">No sale</span>
            {/if}
        </span>
    </a>
</li>
