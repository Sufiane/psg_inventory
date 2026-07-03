<script lang="ts">
    import Button from './Button.svelte';
    import ImportSalesDraft from './ImportSalesDraft.svelte';
    import { previewImport } from '$lib/api/sales-import';
    import type { SeasonPass } from '$lib/types';
    import type { PreviewResponse } from '$lib/types/sales-import';

    type Props = {
        open: boolean;
        passes: SeasonPass[];
        onClose: () => void;
        onCommitted?: () => void;
    };

    const { open, passes, onClose, onCommitted }: Props = $props();

    let step = $state<'passes' | 'upload' | 'draft'>('passes');
    let preview = $state<PreviewResponse | null>(null);
    let selectedPassIds = $state<string[]>([]);
    let file = $state<File | null>(null);
    let loading = $state(false);
    let errorMessage = $state<string | null>(null);

    let dialogEl = $state<HTMLDialogElement | null>(null);

    $effect(() => {
        if (dialogEl == null) {
            return;
        }

        if (open && !dialogEl.open) {
            dialogEl.showModal();
        } else if (!open && dialogEl.open) {
            dialogEl.close();
        }
    });

    function currentSeasonYear(): number {
        const now = new Date();

        return now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
    }

    const passesByYear = $derived.by(() => {
        const grouped = new Map<number, SeasonPass[]>();

        for (const pass of passes) {
            const bucket = grouped.get(pass.seasonStartYear) ?? [];

            bucket.push(pass);
            grouped.set(pass.seasonStartYear, bucket);
        }

        return [...grouped.entries()].sort(
            ([leftYear], [rightYear]) => rightYear - leftYear,
        );
    });

    const currentYear = $derived(currentSeasonYear());
    const currentGroup = $derived(
        passesByYear.find(([year]) => year === currentYear),
    );
    const previousGroups = $derived(
        passesByYear.filter(([year]) => year !== currentYear),
    );
    const hasPreviousSelected = $derived(
        selectedPassIds.some((id) => {
            const pass = passes.find((candidate) => candidate.id === id);

            return pass != null && pass.seasonStartYear !== currentYear;
        }),
    );

    const selectedYears = $derived.by(() => {
        const years = new Set<number>();

        for (const pass of passes) {
            if (selectedPassIds.includes(pass.id)) {
                years.add(pass.seasonStartYear);
            }
        }

        return [...years];
    });

    const passesStepValid = $derived(
        selectedPassIds.length > 0 && selectedYears.length === 1,
    );

    function togglePass(id: string): void {
        if (selectedPassIds.includes(id)) {
            selectedPassIds = selectedPassIds.filter((passId) => passId !== id);
        } else {
            selectedPassIds = [...selectedPassIds, id];
        }
    }

    function onFileChange(event: Event): void {
        const input = event.currentTarget as HTMLInputElement;

        file = input.files?.[0] ?? null;
    }

    async function submitUpload(): Promise<void> {
        if (file == null) {
            return;
        }

        loading = true;
        errorMessage = null;

        try {
            preview = await previewImport(file, selectedPassIds);
            step = 'draft';
        } catch (error) {
            errorMessage =
                error instanceof Error ? error.message : 'Failed to preview.';
        } finally {
            loading = false;
        }
    }

    function reset(): void {
        step = 'passes';
        selectedPassIds = [];
        file = null;
        preview = null;
        errorMessage = null;
    }

    function handleCommitted(): void {
        onCommitted?.();
        reset();
        onClose();
    }

    function handleClose(): void {
        reset();
        onClose();
    }
</script>

<dialog
    bind:this={dialogEl}
    onclose={handleClose}
    class="fixed inset-0 m-auto h-fit max-h-[90vh] w-full max-w-2xl overflow-auto rounded bg-surface p-0 shadow-xl backdrop:bg-black/40"
>
    <div class="flex flex-col gap-4 p-6">
        <header class="flex items-center justify-between">
            <h2 class="text-lg font-medium">Import sales</h2>
            <button
                type="button"
                class="text-sm text-muted hover:text-primary"
                onclick={handleClose}
                aria-label="Close import dialog"
            >
                Close
            </button>
        </header>

        {#if step === 'passes'}
            <section class="flex flex-col gap-3">
                <p class="text-sm text-muted">
                    Pick the season pass(es) these sales draw from. All selected passes
                    must belong to the same season.
                </p>

                {#if passesByYear.length === 0}
                    <p class="text-sm">
                        No season passes yet.
                        <a href="/season" class="underline">Create one first</a>.
                    </p>
                {:else}
                    {#if currentGroup != null}
                        {@const [year, group] = currentGroup}
                        <fieldset class="flex flex-col gap-2 rounded border p-3">
                            <legend class="px-1 text-xs font-medium uppercase text-muted">
                                Current season · {year}
                            </legend>
                            {#each group as pass (pass.id)}
                                <label class="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={selectedPassIds.includes(pass.id)}
                                        onchange={() => togglePass(pass.id)}
                                    />
                                    <span>{pass.label} — {pass.category}, row {pass.row}, seat {pass.seat}</span>
                                </label>
                            {/each}
                        </fieldset>
                    {/if}

                    {#if previousGroups.length > 0}
                        <details class="rounded border p-3">
                            <summary class="cursor-pointer text-sm">
                                Previous seasons
                            </summary>
                            <div class="mt-2 flex flex-col gap-3">
                                {#each previousGroups as [year, group] (year)}
                                    <fieldset class="flex flex-col gap-2">
                                        <legend class="text-xs font-medium uppercase text-muted">
                                            Season {year}
                                        </legend>
                                        {#each group as pass (pass.id)}
                                            <label class="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPassIds.includes(pass.id)}
                                                    onchange={() => togglePass(pass.id)}
                                                />
                                                <span>{pass.label} — {pass.category}, row {pass.row}, seat {pass.seat}</span>
                                            </label>
                                        {/each}
                                    </fieldset>
                                {/each}
                            </div>
                        </details>
                    {/if}
                {/if}

                {#if hasPreviousSelected}
                    <p class="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                        Importing into a past season will recompute that season's
                        accounting numbers. Any closed-season totals shown elsewhere
                        will update.
                    </p>
                {/if}

                {#if selectedYears.length > 1}
                    <p class="text-sm text-red-600">
                        Passes span more than one season. Pick from a single season.
                    </p>
                {/if}

                <footer class="flex justify-end gap-2">
                    <Button
                        disabled={!passesStepValid}
                        onclick={() => (step = 'upload')}
                    >
                        Next
                    </Button>
                </footer>
            </section>
        {:else if step === 'upload'}
            <section class="flex flex-col gap-3">
                <p class="text-sm text-muted">
                    Upload a CSV with columns:
                    <code class="text-xs">
                        date, opponent, listedPrice, nbTickets, status, invest
                    </code>
                    (invest optional).
                </p>

                <input
                    type="file"
                    accept=".csv,text/csv"
                    onchange={onFileChange}
                    class="text-sm"
                />

                {#if errorMessage}
                    <p class="text-sm text-red-600">{errorMessage}</p>
                {/if}

                <footer class="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        class="text-sm text-muted hover:text-primary"
                        onclick={() => (step = 'passes')}
                    >
                        ← Back
                    </button>
                    <Button
                        disabled={file == null || loading}
                        loading={loading}
                        onclick={submitUpload}
                    >
                        Preview
                    </Button>
                </footer>
            </section>
        {:else if preview != null}
            <ImportSalesDraft
                preview={preview}
                selectedPassIds={selectedPassIds}
                passes={passes}
                onCommitted={handleCommitted}
                onCancel={() => (step = 'upload')}
            />
        {/if}
    </div>
</dialog>
