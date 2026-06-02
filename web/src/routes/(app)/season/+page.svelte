<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import { money } from '$lib/format';
    import Spinner from '$lib/ui/Spinner.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
    let pass = $derived(data.pass);
    let submitting = $state<'upsert' | 'remove' | null>(null);
</script>

<div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-semibold">Season passes</h1>

    <form method="GET" class="flex items-center gap-2">
        <label class="text-sm text-slate-600" for="year">Season</label>
        <select
            id="year"
            name="year"
            class="rounded border border-slate-300 px-2 py-1 text-sm"
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
        class="mb-4 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2"
    >
        {form.info}
    </p>
{/if}
{#if form && !form.success && form.message}
    <p class="mb-4 rounded bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
        {form.message}
    </p>
{/if}

<div class="grid md:grid-cols-2 gap-6">
    <section class="bg-white rounded-lg border border-slate-200 p-6">
        <h2 class="font-semibold mb-4">
            Season {data.year} pass
        </h2>

        <form
            method="POST"
            action="?/upsert"
            class="space-y-4"
            use:enhance={() => {
                submitting = 'upsert';

                return async ({ update }) => {
                    await update();
                    submitting = null;
                };
            }}
        >
            <input type="hidden" name="seasonStartYear" value={data.year} />

            <label class="block">
                <span class="text-sm text-slate-700">Price (€)</span>
                <input
                    type="number"
                    name="price"
                    min="0"
                    step="1"
                    required
                    value={pass?.price ?? ''}
                    class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
            </label>

            <label class="block">
                <span class="text-sm text-slate-700">Category</span>
                <input
                    type="text"
                    name="category"
                    maxlength="64"
                    value={pass?.category ?? ''}
                    placeholder="e.g. Tribune Boulogne"
                    class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
            </label>

            <div class="grid grid-cols-2 gap-3">
                <label class="block">
                    <span class="text-sm text-slate-700">Row</span>
                    <input
                        type="text"
                        name="row"
                        maxlength="32"
                        value={pass?.row ?? ''}
                        class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    />
                </label>

                <label class="block">
                    <span class="text-sm text-slate-700">Seat #</span>
                    <input
                        type="text"
                        name="seat"
                        maxlength="32"
                        value={pass?.seat ?? ''}
                        class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    />
                </label>
            </div>

            <div class="flex items-center gap-3">
                <button
                    type="submit"
                    disabled={submitting !== null}
                    class="rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                    {#if submitting === 'upsert'}
                        <Spinner size="1em" />
                    {/if}
                    {pass ? 'Update' : 'Create'}
                </button>

                {#if pass}
                    <button
                        type="submit"
                        formaction="?/remove"
                        formnovalidate
                        disabled={submitting !== null}
                        class="rounded border border-red-300 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                        onclick={(event) => {
                            if (!confirm(`Delete season ${data.year} pass?`)) {
                                event.preventDefault();

                                return;
                            }

                            submitting = 'remove';
                        }}
                    >
                        {#if submitting === 'remove'}
                            <Spinner size="1em" />
                        {/if}
                        Delete
                    </button>
                {/if}
            </div>
        </form>
    </section>

    <section class="bg-white rounded-lg border border-slate-200 p-6">
        <h2 class="font-semibold mb-4">All recorded seasons</h2>

        {#if data.passes.length === 0}
            <p class="text-slate-400 text-sm">No season passes recorded yet.</p>
        {:else}
            <ul class="divide-y divide-slate-100 text-sm">
                {#each data.passes as p (p.id)}
                    <li class="py-2 flex items-center gap-3">
                        <a
                            href="/season?year={p.seasonStartYear}"
                            class="font-medium text-blue-600 hover:underline w-20"
                            >{p.seasonStartYear}</a
                        >
                        <span class="flex-1 text-slate-600">
                            {p.category ?? '—'}{p.row ? ` · Row ${p.row}` : ''}{p.seat
                                ? ` · Seat ${p.seat}`
                                : ''}
                        </span>
                        <span class="text-right font-mono">{money(p.price)}</span>
                    </li>
                {/each}
            </ul>
        {/if}
    </section>
</div>
