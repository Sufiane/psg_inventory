<script lang="ts">
    import type { PageData } from './$types';
    import { page } from '$app/state';
    import { competitionLabel } from '$lib/format';
    import MatchInspector from '$lib/ui/MatchInspector.svelte';
    import FilterTabs from '$lib/ui/FilterTabs.svelte';
    import MatchRow from '$lib/ui/MatchRow.svelte';
    import MatchesSummary from '$lib/ui/MatchesSummary.svelte';
    import type { FormattedMatch } from '$lib/types';

    let { data }: { data: PageData } = $props();

    const venueOptions = [
        { value: 'both', label: 'Both' },
        { value: 'home', label: 'Home' },
        { value: 'away', label: 'Away' },
    ] as const;

    const selectedId = $derived(page.url.searchParams.get('match'));
    const selectedMatch = $derived(
        [...data.upcoming, ...data.past].find((match) => match.id === selectedId) ?? null,
    );

    const tabs = $derived(
        [
            { value: 'all', label: 'All' },
            ...data.competitions.map((competition) => ({
                value: competition,
                label: competitionLabel(competition),
            })),
        ].map((tab) => ({
            href: queryHref(tab.value === 'all' ? {} : { competition: tab.value }, [
                'match',
                'competition',
            ]),
            label: tab.label,
            active: data.competition === tab.value,
        })),
    );

    const clearHref = $derived(data.year !== null ? `?year=${data.year}` : '?');

    function queryHref(set: Record<string, string>, drop: string[] = []): string {
        const params = new URLSearchParams(page.url.searchParams);

        for (const key of drop) {
            params.delete(key);
        }

        for (const [key, value] of Object.entries(set)) {
            params.set(key, value);
        }

        return `?${params.toString()}`;
    }
</script>

{#snippet matchList(matches: FormattedMatch[])}
    <ul class="overflow-hidden rounded-lg border border-line bg-surface divide-y divide-line">
        {#each matches as match (match.id)}
            <MatchRow
                {match}
                sales={data.salesByMatch[match.id] ?? []}
                selected={match.id === selectedId}
                selectHref={queryHref({ match: match.id })}
            />
        {/each}
    </ul>
{/snippet}

<div class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Matches</h1>
    <p class="mt-1 text-sm text-ink-muted">
        Fixtures grouped by season. Sales attach to a match.
    </p>
</div>

<div class="mb-6">
    <MatchesSummary
        played={data.playedCount}
        total={data.totalCount}
        sold={data.ticketsSold}
        pending={data.ticketsPending}
        gifted={data.ticketsGifted}
        net={data.net}
    />
</div>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <FilterTabs label="Competition" {tabs} />

    <form method="GET" class="flex items-center gap-2">
        {#if data.year !== null}
            <input type="hidden" name="year" value={data.year} />
        {/if}
        {#if data.competition !== 'all'}
            <input type="hidden" name="competition" value={data.competition} />
        {/if}

        <div
            class="inline-flex items-center gap-0.5 rounded-md border border-line-strong bg-surface p-0.5"
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
                    class="min-h-9 rounded px-2.5 text-sm transition-colors duration-150 {active
                        ? 'bg-surface-strong text-ink font-medium'
                        : 'text-ink-muted hover:bg-surface-strong/60 hover:text-ink'}"
                >
                    {option.label}
                </button>
            {/each}
        </div>
    </form>
</div>

{#if data.totalCount === 0}
    <p class="text-ink-faint text-sm">No matches for this season yet.</p>
{:else if data.filteredCount === 0}
    <p class="text-ink-faint text-sm">
        No matches match these filters.
        <a
            href={clearHref}
            class="text-primary font-medium hover:text-primary-hover hover:underline"
            >Clear filters</a
        >
    </p>
{:else}
    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
            {#if !data.isPastSeason}
                {#if data.upcoming.length > 0}
                    <div class="mb-4">{@render matchList(data.upcoming)}</div>
                {:else if data.totalUpcomingCount === 0}
                    <p class="mb-4 text-sm text-ink-faint">
                        No upcoming matches left this season.
                    </p>
                {:else}
                    <p class="mb-4 text-sm text-ink-faint">
                        No upcoming matches match your filters.
                        <a
                            href={clearHref}
                            class="text-primary font-medium hover:text-primary-hover hover:underline"
                            >Clear filters</a
                        >
                    </p>
                {/if}
            {/if}

            {#if data.past.length > 0}
                {#if data.isPastSeason}
                    {@render matchList(data.past)}
                {:else}
                    <details class="group">
                        <summary
                            class="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-sm text-ink-muted transition-colors hover:text-ink"
                        >
                            <span
                                aria-hidden="true"
                                class="inline-block transition-transform duration-150 group-open:rotate-90"
                                >&rsaquo;</span
                            >
                            Show {data.past.length}
                            {data.past.length === 1 ? 'past match' : 'past matches'}
                        </summary>

                        <div class="mt-2">
                            {@render matchList(data.past)}
                        </div>
                    </details>
                {/if}
            {/if}
        </div>

        <div aria-live="polite" class="hidden lg:sticky lg:top-4 lg:block">
            {#if selectedMatch}
                <MatchInspector
                    match={selectedMatch}
                    sales={data.salesByMatch[selectedMatch.id] ?? []}
                />
            {:else}
                <p
                    class="rounded-lg border border-dashed border-line-strong p-5 text-sm text-ink-faint"
                >
                    Select a match to see its sales.
                </p>
            {/if}
        </div>
    </div>
{/if}
