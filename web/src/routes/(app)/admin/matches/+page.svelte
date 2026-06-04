<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import { competitionLabel } from '$lib/format';
    import Spinner from '$lib/ui/Spinner.svelte';

    type Op = 'loadCurrent' | 'loadSeason' | 'create' | 'cancelStaleSales';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

    let submitting = $state<Op | null>(null);

    function track(op: Op) {
        return () => {
            submitting = op;

            return async ({ update }: { update: () => Promise<void> }) => {
                await update();
                submitting = null;
            };
        };
    }
</script>

<h1 class="text-2xl font-semibold tracking-tight text-ink mb-6">Admin board</h1>

{#if form?.success}
    <p
        role="status"
        class="mb-4 rounded-lg border border-positive bg-positive/10 text-positive-strong text-sm px-3 py-2"
    >
        {form.info}
    </p>
{/if}
{#if form && !form.success && form.message}
    <p
        role="alert"
        class="mb-4 rounded-lg border border-negative bg-negative/5 text-negative-strong text-sm px-3 py-2"
    >
        {form.message}
    </p>
{/if}

<div class="grid md:grid-cols-2 gap-6">
    <section class="bg-surface rounded-lg border border-line p-6">
        <h2 class="text-base font-semibold tracking-tight text-ink mb-4">
            Load matches from data provider
        </h2>

        <form
            method="POST"
            action="?/loadCurrent"
            class="mb-4"
            use:enhance={track('loadCurrent')}
        >
            <button
                type="submit"
                disabled={submitting !== null}
                class="rounded bg-primary text-surface px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
            >
                {#if submitting === 'loadCurrent'}
                    <Spinner size="1em" />
                {/if}
                Load current season
            </button>
        </form>

        <form
            method="POST"
            action="?/loadSeason"
            class="flex items-end gap-2"
            use:enhance={track('loadSeason')}
        >
            <label class="block">
                <span class="text-sm text-ink-muted">Season start year</span>
                <select
                    name="year"
                    disabled={submitting !== null}
                    class="mt-1 rounded border border-line-strong bg-surface text-ink px-3 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {#each years as year (year)}
                        <option value={year}>{year}</option>
                    {/each}
                </select>
            </label>
            <button
                type="submit"
                disabled={submitting !== null}
                class="rounded border border-line-strong text-ink-muted hover:text-ink hover:border-ink px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
            >
                {#if submitting === 'loadSeason'}
                    <Spinner size="1em" />
                {/if}
                Load season
            </button>
        </form>
    </section>

    <section class="bg-surface rounded-lg border border-line p-6">
        <h2 class="text-base font-semibold tracking-tight text-ink mb-4">
            Create match manually
        </h2>

        <form
            method="POST"
            action="?/create"
            class="space-y-3"
            use:enhance={track('create')}
        >
            <label class="block">
                <span class="text-sm text-ink-muted">Opponent</span>
                <input
                    type="text"
                    name="opponent"
                    required
                    class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                />
            </label>

            <label class="block">
                <span class="text-sm text-ink-muted">Date</span>
                <input
                    type="datetime-local"
                    name="date"
                    required
                    class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                />
            </label>

            <label class="flex items-center gap-2">
                <input type="checkbox" name="atHome" class="rounded border-line-strong" />
                <span class="text-sm text-ink">At home</span>
            </label>

            <label class="block">
                <span class="text-sm text-ink-muted">Competition</span>
                <select
                    name="competition"
                    required
                    class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                >
                    {#each data.competitions as competition (competition)}
                        <option value={competition}>{competitionLabel(competition)}</option>
                    {/each}
                </select>
            </label>

            <fieldset class="border border-line rounded p-3">
                <legend class="text-xs text-ink-muted px-1">Result (optional)</legend>
                <label class="block mb-2">
                    <span class="text-sm text-ink-muted">Score (e.g. "2 - 1")</span>
                    <input
                        type="text"
                        name="score"
                        pattern="\d{'{1,2}'} - \d{'{1,2}'}"
                        placeholder="2 - 1"
                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                    />
                </label>
                <label class="flex items-center gap-2">
                    <input type="checkbox" name="isWin" class="rounded border-line-strong" />
                    <span class="text-sm text-ink">Win</span>
                </label>
            </fieldset>

            <button
                type="submit"
                disabled={submitting !== null}
                class="rounded bg-primary text-surface px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
            >
                {#if submitting === 'create'}
                    <Spinner size="1em" />
                {/if}
                Create match
            </button>
        </form>
    </section>

    <section class="bg-surface rounded-lg border border-line p-6 md:col-span-2">
        <h2 class="text-base font-semibold tracking-tight text-ink mb-2">Operations</h2>
        <p class="text-sm text-ink-muted mb-4">
            Cancel unrealized sales whose match has already passed. The cron runs on a
            schedule; this button forces it immediately.
        </p>

        <form
            method="POST"
            action="?/cancelStaleSales"
            use:enhance={track('cancelStaleSales')}
        >
            <button
                type="submit"
                disabled={submitting !== null}
                class="rounded bg-warning-strong text-surface px-4 py-2 text-sm font-medium hover:bg-warning disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
                onclick={(event) => {
                    if (!confirm('Force-cancel stale unrealized sales now?')) {
                        event.preventDefault();
                    }
                }}
            >
                {#if submitting === 'cancelStaleSales'}
                    <Spinner size="1em" />
                {/if}
                Cancel stale unrealized sales
            </button>
        </form>
    </section>
</div>
