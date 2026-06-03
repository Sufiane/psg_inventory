<script lang="ts">
    import type { PageData } from './$types';
    import { competitionLabel, dateTime } from '$lib/format';

    let { data }: { data: PageData } = $props();
</script>

<a
    href="/matches"
    class="text-sm text-primary font-medium hover:text-primary-hover hover:underline"
    >&larr; Matches</a
>

<h1 class="text-2xl font-semibold tracking-tight text-ink mt-2 mb-6">
    PSG {data.match.atHome ? 'vs' : '@'} {data.match.opponent}
</h1>

<div class="bg-surface rounded-lg border border-line p-4 space-y-2 text-sm">
    <div>
        <span class="text-ink-muted">Date:</span>
        <span class="text-ink">{dateTime(data.match.date)}</span>
    </div>
    <div>
        <span class="text-ink-muted">Competition:</span>
        <span class="text-ink">{competitionLabel(data.match.competition)}</span>
    </div>
    <div>
        <span class="text-ink-muted">Venue:</span>
        <span class="text-ink">{data.match.atHome ? 'Home' : 'Away'}</span>
    </div>
    {#if data.match.result?.score}
        <div>
            <span class="text-ink-muted">Result:</span>
            <span
                class="font-mono {data.match.result.isWin
                    ? 'text-positive'
                    : 'text-negative'}"
            >
                {data.match.result.score}
            </span>
            <span class="text-ink-muted"
                >({data.match.result.isWin ? 'Win' : 'Loss / Draw'})</span
            >
        </div>
    {/if}

    <div class="pt-3">
        <a
            href="/sales/new?matchId={data.match.id}"
            class="inline-block rounded bg-primary text-surface px-3 py-1.5 text-sm font-medium hover:bg-primary-hover transition-colors"
        >
            Add sale for this match
        </a>
    </div>
</div>
