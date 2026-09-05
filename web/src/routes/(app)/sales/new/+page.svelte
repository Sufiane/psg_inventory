<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import { competitionLabel, dateTime } from '$lib/format';
    import { seasonStartYearFromDate } from '$lib/season';
    import Spinner from '$lib/ui/Spinner.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    let submitting = $state(false);
    let selectedMatchId = $state(data.presetMatchId ?? '');

    // SvelteKit reuses this component across same-route navigations (e.g. a
    // link to /sales/new?matchId=B while already on /sales/new?matchId=A) —
    // only `data` swaps, so re-seed the selection whenever the preset changes.
    $effect(() => {
        selectedMatchId = data.presetMatchId ?? '';
    });

    let selectedMatch = $derived(
        data.matches.find((match) => match.id === selectedMatchId) ?? null,
    );
    let selectedSeason = $derived(
        selectedMatch === null
            ? null
            : seasonStartYearFromDate(new Date(selectedMatch.date)),
    );
    let seasonLabel = $derived(
        selectedSeason === null ? '' : `${selectedSeason}/${selectedSeason + 1}`,
    );
    let visiblePasses = $derived(
        selectedSeason === null
            ? []
            : data.passes.filter((pass) => pass.seasonStartYear === selectedSeason),
    );
</script>

<a
    href="/sales"
    class="text-sm text-primary font-medium hover:text-primary-hover hover:underline"
    >&larr; Sales</a
>

<h1 class="text-2xl font-semibold tracking-tight text-ink mt-2 mb-6">New sale</h1>

<form
    method="POST"
    class="max-w-lg bg-surface rounded-lg border border-line p-6 space-y-4"
    use:enhance={() => {
        submitting = true;

        return async ({ update }) => {
            await update();
            submitting = false;
        };
    }}
>
    <label class="block">
        <span class="text-sm text-ink-muted">Match</span>
        <select
            name="matchId"
            required
            bind:value={selectedMatchId}
            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
        >
            <option value="">Select a match…</option>
            {#each data.matches as match (match.id)}
                <option value={match.id}>
                    {dateTime(match.date)}, {match.atHome ? 'vs' : '@'} {match.opponent}
                    ({competitionLabel(match.competition)})
                </option>
            {/each}
        </select>
    </label>

    <fieldset class="rounded border border-line p-3 space-y-2">
        <legend class="text-sm text-ink-muted px-1">Tickets per pass</legend>

        {#if selectedMatch === null}
            <p class="text-xs text-ink-faint">
                Pick a match first — only passes from that match's season can be used.
            </p>
        {:else if visiblePasses.length === 0}
            <p class="text-xs text-negative-strong">
                No season pass for {seasonLabel} — <a
                    href="/season"
                    class="text-primary hover:text-primary-hover hover:underline"
                    >create one</a
                > before logging this sale.
            </p>
        {:else}
            {#each visiblePasses as pass (pass.id)}
                <label class="flex items-center justify-between gap-3">
                    <span class="text-sm text-ink-muted truncate">
                        {pass.seasonStartYear} · {pass.label}
                        <span class="text-ink-faint">
                            ({pass.category} · {pass.row}/{pass.seat})
                        </span>
                    </span>
                    <input
                        type="number"
                        name={`alloc_${pass.id}`}
                        min="0"
                        step="1"
                        value="0"
                        class="w-20 rounded border border-line-strong bg-surface text-ink px-2 py-1 text-right"
                    />
                </label>
            {/each}
        {/if}
    </fieldset>

    <label class="block">
        <span class="text-sm text-ink-muted">Listed price (€)</span>
        <input
            type="number"
            name="listedPrice"
            min="1"
            step="0.01"
            required
            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
        />
    </label>

    <label class="block">
        <span class="text-sm text-ink-muted">Cost paid for tickets (€, optional)</span>
        <input
            type="number"
            name="invest"
            min="0"
            step="0.01"
            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
        />
    </label>

    {#if form?.message}
        <p role="alert" class="text-sm text-negative-strong">{form.message}</p>
    {/if}

    <button
        type="submit"
        disabled={submitting}
        class="rounded bg-primary text-surface px-4 py-2 font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
    >
        {#if submitting}
            <Spinner size="1em" />
        {/if}
        Create sale
    </button>
</form>
