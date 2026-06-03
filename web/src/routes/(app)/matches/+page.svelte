<script lang="ts">
    import type { PageData } from './$types';
    import { competitionLabel, dateTime } from '$lib/format';

    let { data }: { data: PageData } = $props();

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

    const venueOptions = [
        { value: 'both', label: 'Both' },
        { value: 'home', label: 'Home' },
        { value: 'away', label: 'Away' },
    ] as const;

    let upcoming = $derived.by(() => {
        const now = Date.now();

        return data.matches.filter((match) => new Date(match.date).getTime() >= now);
    });

    let past = $derived.by(() => {
        const now = Date.now();

        return data.matches
            .filter((match) => new Date(match.date).getTime() < now)
            .sort(
                (left, right) =>
                    new Date(right.date).getTime() - new Date(left.date).getTime(),
            );
    });
</script>

<div class="flex flex-wrap items-end justify-between gap-3 mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Matches</h1>

    <form method="GET" class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
            <label class="text-sm text-ink-muted" for="year">Season</label>
            <select
                id="year"
                name="year"
                class="rounded border border-line-strong bg-surface text-ink-muted px-2 py-1 text-sm hover:text-ink hover:border-ink transition-colors"
                onchange={(event) => event.currentTarget.form?.requestSubmit()}
            >
                <option value="">Current</option>
                {#each years as year (year)}
                    <option value={year} selected={data.year === year}>{year}</option>
                {/each}
            </select>
        </div>

        <div
            class="inline-flex items-center gap-0.5 bg-surface border border-line-strong rounded-md p-0.5"
            role="group"
            aria-label="Venue"
        >
            {#each venueOptions as option (option.value)}
                {@const active = data.venue === option.value}
                <button
                    type="submit"
                    name="venue"
                    value={option.value}
                    aria-pressed={active}
                    class="px-2.5 py-1 text-sm rounded transition-colors duration-150 {active
                        ? 'bg-primary text-surface'
                        : 'text-ink-muted hover:bg-surface-strong hover:text-ink'}"
                >
                    {option.label}
                </button>
            {/each}
        </div>

        <div class="flex items-center gap-2">
                <label class="text-sm text-ink-muted" for="competition">Competition</label>
                <select
                    id="competition"
                    name="competition"
                    class="rounded border border-line-strong bg-surface text-ink-muted px-2 py-1 text-sm hover:text-ink hover:border-ink transition-colors"
                    onchange={(event) => event.currentTarget.form?.requestSubmit()}
                >
                    <option value="all" selected={data.competition === 'all'}>All</option>
                    {#each data.competitions as comp (comp)}
                        <option value={comp} selected={data.competition === comp}>
                            {competitionLabel(comp)}
                        </option>
                    {/each}
            </select>
        </div>
    </form>
</div>

{#if data.matches.length === 0}
    <p class="text-ink-faint text-sm">No matches match these filters.</p>
{:else}
    {#if upcoming.length > 0}
        <ul class="bg-surface rounded-lg border border-line divide-y divide-line mb-4">
            {#each upcoming as match (match.id)}
                <li class="px-4 py-3 flex items-center gap-3 text-sm">
                    <span class="w-32 shrink-0 text-ink-muted">{dateTime(match.date)}</span>
                    <span class="flex-1 min-w-0 text-ink truncate">
                        {match.atHome ? 'vs' : '@'}
                        <strong>{match.opponent}</strong>
                    </span>
                    <span class="text-ink-faint text-xs w-32 shrink-0"
                        >{competitionLabel(match.competition)}</span
                    >
                    {#if match.result?.score}
                        <span
                            class="font-mono text-xs shrink-0 {match.result.isWin
                                ? 'text-positive'
                                : 'text-negative'}"
                        >
                            {match.result.score}
                        </span>
                    {/if}
                    <a
                        href="/matches/{match.id}"
                        class="text-primary font-medium hover:text-primary-hover hover:underline shrink-0"
                        >View</a
                    >
                </li>
            {/each}
        </ul>
    {:else}
        <p class="text-ink-faint text-sm mb-4">No upcoming matches.</p>
    {/if}

    {#if past.length > 0}
        <details class="group">
            <summary
                class="cursor-pointer list-none inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink py-2 transition-colors"
            >
                <span
                    aria-hidden="true"
                    class="inline-block transition-transform duration-150 group-open:rotate-90"
                    >&rsaquo;</span
                >
                Show {past.length}
                {past.length === 1 ? 'past match' : 'past matches'}
            </summary>

            <ul
                class="mt-2 bg-surface rounded-lg border border-line divide-y divide-line"
            >
                {#each past as match (match.id)}
                    <li class="px-4 py-3 flex items-center gap-3 text-sm">
                        <span class="w-32 shrink-0 text-ink-muted"
                            >{dateTime(match.date)}</span
                        >
                        <span class="flex-1 min-w-0 text-ink truncate">
                            {match.atHome ? 'vs' : '@'}
                            <strong>{match.opponent}</strong>
                        </span>
                        <span class="text-ink-faint text-xs w-32 shrink-0"
                            >{competitionLabel(match.competition)}</span
                        >
                        {#if match.result?.score}
                            <span
                                class="font-mono text-xs shrink-0 {match.result.isWin
                                    ? 'text-positive'
                                    : 'text-negative'}"
                            >
                                {match.result.score}
                            </span>
                        {/if}
                        <a
                            href="/matches/{match.id}"
                            class="text-primary font-medium hover:text-primary-hover hover:underline shrink-0"
                            >View</a
                        >
                    </li>
                {/each}
            </ul>
        </details>
    {/if}
{/if}
