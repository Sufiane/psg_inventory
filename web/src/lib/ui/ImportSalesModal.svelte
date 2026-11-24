<script lang="ts">
    import Button from './Button.svelte';
    import ImportPassPicker from './ImportPassPicker.svelte';
    import ImportSalesDraft from './ImportSalesDraft.svelte';
    import { formatFileSize, selectedSeasonYears } from '$lib/import-draft';
    import { previewImport } from '$lib/api/sales-import';
    import type { SeasonPass } from '$lib/types';
    import type { PreviewResponse } from '$lib/types/sales-import';
    import { seasonStartYearFromDate } from '$lib/season';

    type Props = {
        open: boolean;
        passes: SeasonPass[];
        onClose: () => void;
        onCommitted?: () => void;
    };

    const { open, passes, onClose, onCommitted }: Props = $props();

    let step = $state<'source' | 'review'>('source');
    let dragging = $state(false);
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

    const currentYear = seasonStartYearFromDate(new Date());
    const selectedYears = $derived(selectedSeasonYears(passes, selectedPassIds));
    const hasPreviousSelected = $derived(
        selectedYears.some((year) => year !== currentYear),
    );
    const passesStepValid = $derived(
        selectedPassIds.length > 0 && selectedYears.length === 1,
    );
    const canPreview = $derived(passesStepValid && file != null && !loading);

    function togglePass(id: string): void {
        if (selectedPassIds.includes(id)) {
            selectedPassIds = selectedPassIds.filter((passId) => passId !== id);
        } else {
            selectedPassIds = [...selectedPassIds, id];
        }
    }

    function onFileChange(event: Event): void {
        const input = event.currentTarget as HTMLInputElement;

        const selected = input.files?.[0];

        if (selected != null) {
            file = selected;
            errorMessage = null;
        }
    }

    function onDragOver(event: DragEvent): void {
        event.preventDefault();
        dragging = true;
    }

    function onDragLeave(event: DragEvent): void {
        const next = event.relatedTarget;

        if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) {
            return;
        }

        dragging = false;
    }

    function onDrop(event: DragEvent): void {
        event.preventDefault();
        dragging = false;

        const dropped = event.dataTransfer?.files[0];

        if (dropped == null) {
            return;
        }

        if (dropped.name.toLowerCase().endsWith('.csv')) {
            file = dropped;
            errorMessage = null;
        } else {
            errorMessage = 'Only .csv files are supported.';
        }
    }

    async function submitUpload(): Promise<void> {
        if (file == null) {
            return;
        }

        loading = true;
        errorMessage = null;

        try {
            preview = await previewImport(file, selectedPassIds);
            step = 'review';
        } catch (error) {
            errorMessage =
                error instanceof Error ? error.message : 'Failed to preview.';
        } finally {
            loading = false;
        }
    }

    function reset(): void {
        step = 'source';
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
    aria-labelledby="import-sales-title"
    class="fixed inset-0 m-auto h-fit max-h-[90vh] w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-black/60 {step ===
    'review'
        ? 'max-w-5xl'
        : 'max-w-2xl'}"
>
    <div class="flex max-h-[90vh] flex-col">
        <header class="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2.5">
                    <span class="size-2.5 shrink-0 bg-brand" aria-hidden="true"></span>
                    <h2 id="import-sales-title" class="font-display text-xl font-bold tracking-tight">Import sales</h2>
                </div>
                <ol class="flex items-center gap-3 text-xs font-medium uppercase tracking-wider">
                    <li
                        class={step === 'source' ? 'text-ink' : 'text-ink-faint'}
                        aria-current={step === 'source' ? 'step' : undefined}
                    >
                        1 Source
                    </li>
                    <li class="text-ink-faint" aria-hidden="true">/</li>
                    <li
                        class={step === 'review' ? 'text-ink' : 'text-ink-faint'}
                        aria-current={step === 'review' ? 'step' : undefined}
                    >
                        2 Review
                    </li>
                </ol>
            </div>
            <button
                type="button"
                class="-mr-2 -mt-1 flex min-h-11 min-w-11 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-strong hover:text-ink"
                onclick={handleClose}
                aria-label="Close import dialog"
            >
                <svg viewBox="0 0 20 20" class="size-5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
                    <path d="M5 5l10 10M15 5L5 15" />
                </svg>
            </button>
        </header>

        {#if step === 'source'}
            <div class="flex flex-col gap-5 overflow-y-auto px-6 py-5">
                <section class="flex flex-col gap-3">
                    <p class="text-sm text-ink-muted">
                        Pick the season pass(es) these sales draw from. All selected passes
                        must belong to the same season.
                    </p>

                    <ImportPassPicker
                        {passes}
                        {currentYear}
                        {selectedPassIds}
                        onToggle={togglePass}
                    />

                    {#if hasPreviousSelected}
                        <p
                            class="rounded border border-warning bg-warning/10 p-2 text-xs text-warning-strong"
                        >
                            Importing into a past season will recompute that season's
                            accounting numbers. Any closed-season totals shown elsewhere
                            will update.
                        </p>
                    {/if}

                    {#if selectedYears.length > 1}
                        <p class="rounded border border-negative bg-negative/10 p-2 text-sm text-negative-strong">
                            Passes span more than one season. Pick from a single season.
                        </p>
                    {/if}
                </section>

                <section class="flex flex-col gap-2">
                    <label
                        class="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary {dragging
                            ? 'border-primary bg-surface-strong'
                            : 'border-line-strong hover:bg-surface-subtle'}"
                        ondragover={onDragOver}
                        ondragleave={onDragLeave}
                        ondrop={onDrop}
                    >
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            onchange={onFileChange}
                            class="sr-only"
                        />
                        {#if file != null}
                            <span class="max-w-full truncate text-sm font-semibold">{file.name}</span>
                            <span class="text-xs text-ink-muted">
                                {formatFileSize(file.size)} · Click or drop to replace
                            </span>
                        {:else}
                            <span class="text-sm font-medium">Drop a CSV here or click to choose</span>
                            <span class="text-xs text-ink-muted">.csv files only</span>
                        {/if}
                    </label>

                    <p class="text-xs text-ink-muted">
                        Columns:
                        <code>
                            date, opponent, listedPrice, nbTickets, status, invest, soldAt,
                            recipient
                        </code>
                        (invest, soldAt, recipient optional — soldAt applies to SOLD and
                        GIFTED rows, and a GIFTED row without it is dated to the match;
                        recipient is required on GIFTED rows).
                    </p>
                </section>
            </div>

            {#if errorMessage}
                <p role="alert" class="mx-6 mb-3 text-sm text-negative-strong">{errorMessage}</p>
            {/if}

            <footer class="flex justify-end gap-3 border-t border-line bg-surface-subtle px-6 py-4">
                <Button variant="secondary" onclick={handleClose}>Cancel</Button>
                <Button disabled={!canPreview} loading={loading} onclick={submitUpload}>
                    Preview
                </Button>
            </footer>
        {:else if preview != null}
            <div class="flex min-h-0 flex-col">
                <ImportSalesDraft
                    preview={preview}
                    selectedPassIds={selectedPassIds}
                    passes={passes}
                    onCommitted={handleCommitted}
                    onBack={(): void => {
                        step = 'source';
                    }}
                    onCancel={handleClose}
                />
            </div>
        {/if}
    </div>
</dialog>
