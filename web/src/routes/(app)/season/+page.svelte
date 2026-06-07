<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import { money } from '$lib/format';
    import Spinner from '$lib/ui/Spinner.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
    let seasonPasses = $derived(data.seasonPasses);
    let submitting = $state<string | null>(null);
</script>

<div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Season passes</h1>

    <form method="GET" class="flex items-center gap-2">
        <label class="text-sm text-ink-muted" for="year">Season</label>
        <select
            id="year"
            name="year"
            class="rounded border border-line-strong bg-surface text-ink-muted px-2 py-1 text-sm hover:text-ink hover:border-ink transition-colors"
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
        >
            {#each years as year (year)}
                <option value={year} selected={data.year === year}>{year}</option>
            {/each}
        </select>
    </form>
</div>

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

<div class="grid lg:grid-cols-2 gap-6">
    <section class="bg-surface rounded-lg border border-line p-6 space-y-6">
        <header class="flex items-center justify-between">
            <h2 class="text-base font-semibold tracking-tight text-ink">
                Season {data.year} passes
            </h2>
            <span class="text-xs text-ink-faint">{seasonPasses.length} pass(es)</span>
        </header>

        {#if seasonPasses.length === 0}
            <p class="text-ink-faint text-sm">
                No pass for this season yet. Add one below.
            </p>
        {:else}
            <ul class="space-y-4">
                {#each seasonPasses as pass (pass.id)}
                    <li class="rounded-lg border border-line p-4">
                        <form
                            method="POST"
                            action="?/update"
                            class="space-y-3"
                            use:enhance={() => {
                                submitting = `update:${pass.id}`;

                                return async ({ update }) => {
                                    await update();
                                    submitting = null;
                                };
                            }}
                        >
                            <input type="hidden" name="passId" value={pass.id} />

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label class="block">
                                    <span class="text-sm text-ink-muted">Label</span>
                                    <input
                                        type="text"
                                        name="label"
                                        maxlength="64"
                                        required
                                        value={pass.label}
                                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                                    />
                                </label>

                                <label class="block">
                                    <span class="text-sm text-ink-muted">Price (€)</span>
                                    <input
                                        type="number"
                                        name="price"
                                        min="0"
                                        step="1"
                                        required
                                        value={pass.price}
                                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                                    />
                                </label>
                            </div>

                            <label class="block">
                                <span class="text-sm text-ink-muted">Category</span>
                                <input
                                    type="text"
                                    name="category"
                                    maxlength="64"
                                    required
                                    value={pass.category}
                                    class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                                />
                            </label>

                            <div class="grid grid-cols-2 gap-3">
                                <label class="block">
                                    <span class="text-sm text-ink-muted">Row</span>
                                    <input
                                        type="text"
                                        name="row"
                                        maxlength="32"
                                        required
                                        value={pass.row}
                                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                                    />
                                </label>

                                <label class="block">
                                    <span class="text-sm text-ink-muted">Seat</span>
                                    <input
                                        type="text"
                                        name="seat"
                                        maxlength="32"
                                        required
                                        value={pass.seat}
                                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                                    />
                                </label>
                            </div>

                            <div class="flex items-center gap-3">
                                <button
                                    type="submit"
                                    disabled={submitting !== null}
                                    class="rounded bg-primary text-surface px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
                                >
                                    {#if submitting === `update:${pass.id}`}
                                        <Spinner size="1em" />
                                    {/if}
                                    Save
                                </button>

                                <button
                                    type="submit"
                                    formaction="?/remove"
                                    formnovalidate
                                    disabled={submitting !== null}
                                    class="rounded border border-negative text-negative-strong px-4 py-2 text-sm font-medium hover:bg-negative/5 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
                                    onclick={(event) => {
                                        if (!confirm(`Delete pass "${pass.label}"?`)) {
                                            event.preventDefault();

                                            return;
                                        }

                                        submitting = `remove:${pass.id}`;
                                    }}
                                >
                                    {#if submitting === `remove:${pass.id}`}
                                        <Spinner size="1em" />
                                    {/if}
                                    Delete
                                </button>
                            </div>
                        </form>
                    </li>
                {/each}
            </ul>
        {/if}

        <details class="rounded-lg border border-line p-4">
            <summary class="cursor-pointer text-sm font-medium text-ink"
                >+ Add another pass</summary
            >

            <form
                method="POST"
                action="?/create"
                class="mt-4 space-y-3"
                use:enhance={() => {
                    submitting = 'create';

                    return async ({ update }) => {
                        await update();
                        submitting = null;
                    };
                }}
            >
                <input type="hidden" name="seasonStartYear" value={data.year} />

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label class="block">
                        <span class="text-sm text-ink-muted">Label</span>
                        <input
                            type="text"
                            name="label"
                            maxlength="64"
                            required
                            placeholder="e.g. Tribune Auteuil"
                            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                        />
                    </label>

                    <label class="block">
                        <span class="text-sm text-ink-muted">Price (€)</span>
                        <input
                            type="number"
                            name="price"
                            min="0"
                            step="1"
                            required
                            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                        />
                    </label>
                </div>

                <label class="block">
                    <span class="text-sm text-ink-muted">Category</span>
                    <input
                        type="text"
                        name="category"
                        maxlength="64"
                        required
                        class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                    />
                </label>

                <div class="grid grid-cols-2 gap-3">
                    <label class="block">
                        <span class="text-sm text-ink-muted">Row</span>
                        <input
                            type="text"
                            name="row"
                            maxlength="32"
                            required
                            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                        />
                    </label>

                    <label class="block">
                        <span class="text-sm text-ink-muted">Seat</span>
                        <input
                            type="text"
                            name="seat"
                            maxlength="32"
                            required
                            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
                        />
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={submitting !== null}
                    class="rounded bg-primary text-surface px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
                >
                    {#if submitting === 'create'}
                        <Spinner size="1em" />
                    {/if}
                    Add pass
                </button>
            </form>
        </details>
    </section>

    <section class="bg-surface rounded-lg border border-line p-6">
        <h2 class="text-base font-semibold tracking-tight text-ink mb-4">
            All recorded passes
        </h2>

        {#if data.passes.length === 0}
            <p class="text-ink-faint text-sm">No season passes recorded yet.</p>
        {:else}
            <ul class="divide-y divide-line text-sm">
                {#each data.passes as p (p.id)}
                    <li class="py-2 flex items-center gap-3">
                        <a
                            href="/season?year={p.seasonStartYear}"
                            class="font-medium text-primary hover:text-primary-hover hover:underline w-20"
                            >{p.seasonStartYear}</a
                        >
                        <span class="flex-1 text-ink-muted">
                            {p.label} · {p.category} · Row {p.row} · Seat {p.seat}
                        </span>
                        <span class="text-right font-mono text-ink">{money(p.price)}</span>
                    </li>
                {/each}
            </ul>
        {/if}
    </section>
</div>
