<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import { competitionLabel, dateTime } from '$lib/format';
    import Spinner from '$lib/ui/Spinner.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    let submitting = $state(false);
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
            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
        >
            <option value="">Select a match…</option>
            {#each data.matches as match (match.id)}
                <option value={match.id} selected={data.presetMatchId === match.id}>
                    {dateTime(match.date)}, {match.atHome ? 'vs' : '@'} {match.opponent}
                    ({competitionLabel(match.competition)})
                </option>
            {/each}
        </select>
    </label>

    <label class="block">
        <span class="text-sm text-ink-muted">Number of tickets</span>
        <input
            type="number"
            name="nbTickets"
            min="1"
            step="1"
            required
            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
        />
    </label>

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
