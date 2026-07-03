<script lang="ts">
    import { untrack } from 'svelte';
    import Button from './Button.svelte';
    import { commitImport, revertImport } from '$lib/api/sales-import';
    import type {
        CommitResult,
        DraftRow,
        MissingMatch,
        PreviewResponse,
    } from '$lib/types/sales-import';
    import type { SeasonPass } from '$lib/types';

    type Props = {
        preview: PreviewResponse;
        selectedPassIds: string[];
        passes: SeasonPass[];
        onCommitted: () => void;
        onCancel: () => void;
    };

    const { preview, selectedPassIds, passes, onCommitted, onCancel }: Props = $props();

    let rows = $state<DraftRow[]>(untrack(() => preview.rows.map((row) => ({ ...row }))));
    let missingMatches = $state<MissingMatch[]>(
        untrack(() => [...preview.missingMatches]),
    );
    let loading = $state(false);
    let errorMessage = $state<string | null>(null);
    let commitResult = $state<CommitResult | null>(null);

    const summary = $derived.by(() => {
        let errors = 0;
        let warnings = 0;

        for (const row of rows) {
            if (row.rowStatus.startsWith('error:')) {
                errors++;
            } else if (row.rowStatus.startsWith('warn:')) {
                warnings++;
            }
        }

        return { total: rows.length, errors, warnings };
    });

    const canValidate = $derived(rows.length > 0 && summary.errors === 0 && !loading);

    const passLookup = $derived.by(() => {
        const map = new Map<string, SeasonPass>();

        for (const pass of passes) {
            map.set(pass.id, pass);
        }

        return map;
    });

    function selectedPasses(): SeasonPass[] {
        return selectedPassIds
            .map((id) => passLookup.get(id))
            .filter((pass): pass is SeasonPass => pass != null);
    }

    function updateRow(index: number, patch: Partial<DraftRow>): void {
        rows = rows.map((row, i) => (i === index ? { ...row, ...patch, rowStatus: 'ok' } : row));
    }

    function updateAllocation(rowIndex: number, passId: string, count: number): void {
        rows = rows.map((row, i) => {
            if (i !== rowIndex) {
                return row;
            }

            const existing = row.allocations.filter((a) => a.seasonPassId !== passId);
            const next = count > 0 ? [...existing, { seasonPassId: passId, nbTickets: count }] : existing;

            return { ...row, allocations: next, rowStatus: 'ok' };
        });
    }

    function allocationFor(row: DraftRow, passId: string): number {
        return row.allocations.find((a) => a.seasonPassId === passId)?.nbTickets ?? 0;
    }

    function deleteRow(index: number): void {
        rows = rows.filter((_, i) => i !== index);
    }

    function addRow(missing: MissingMatch): void {
        const passIds = selectedPassIds;
        const firstPassId = passIds[0];
        const allocations =
            firstPassId != null ? [{ seasonPassId: firstPassId, nbTickets: 1 }] : [];

        rows = [
            ...rows,
            {
                rowIndex: rows.length,
                date: missing.date,
                opponent: missing.opponentName,
                listedPrice: 0,
                nbTickets: 1,
                invest: 0,
                status: 'PENDING',
                matchId: missing.matchId,
                allocations,
                rowStatus: 'ok',
            },
        ];
        missingMatches = missingMatches.filter((match) => match.matchId !== missing.matchId);
    }

    async function validate(): Promise<void> {
        loading = true;
        errorMessage = null;

        try {
            const result = await commitImport(selectedPassIds, rows);

            commitResult = result;
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Commit failed.';
        } finally {
            loading = false;
        }
    }

    async function undo(): Promise<void> {
        if (commitResult == null) {
            return;
        }

        loading = true;
        errorMessage = null;

        try {
            await revertImport(commitResult.batchId);
            commitResult = null;
            errorMessage = 'Import reverted. You can edit and re-validate.';
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Revert failed.';
        } finally {
            loading = false;
        }
    }

    function finish(): void {
        onCommitted();
    }
</script>

<section class="flex flex-col gap-3">
    {#if commitResult != null}
        <div class="rounded border border-line p-4 text-sm">
            <p class="mb-2">
                {commitResult.salesCreated} sales imported.
            </p>
            <div class="flex gap-2">
                <Button onclick={undo} loading={loading}>Undo import</Button>
                <button
                    type="button"
                    class="text-sm text-ink-muted hover:text-primary"
                    onclick={finish}
                >
                    Done
                </button>
            </div>
            {#if errorMessage}
                <p class="mt-2 text-negative-strong">{errorMessage}</p>
            {/if}
        </div>
    {:else}
        <div class="flex items-center justify-between text-sm">
            <span>
                {summary.total} rows ·
                <span class="text-negative-strong">{summary.errors} errors</span> ·
                <span class="text-warning-strong">{summary.warnings} warnings</span>
            </span>
            <button
                type="button"
                class="text-sm text-ink-muted hover:text-primary"
                onclick={onCancel}
            >
                ← Back
            </button>
        </div>

        <div class="max-h-96 overflow-auto rounded border border-line">
            <table class="w-full text-sm">
                <thead class="bg-surface-subtle text-left text-xs uppercase text-ink-muted">
                    <tr>
                        <th class="p-2">Status</th>
                        <th class="p-2">Date</th>
                        <th class="p-2">Opponent</th>
                        <th class="p-2">Price</th>
                        <th class="p-2">Tickets</th>
                        <th class="p-2">Invest</th>
                        <th class="p-2">Sale status</th>
                        <th class="p-2">Allocations</th>
                        <th class="p-2"></th>
                    </tr>
                </thead>
                <tbody>
                    {#each rows as row, index (index)}
                        <tr class="border-t border-line align-top">
                            <td class="p-2 text-xs">
                                <span
                                    class:text-negative-strong={row.rowStatus.startsWith('error:')}
                                    class:text-warning-strong={row.rowStatus.startsWith('warn:')}
                                    class:text-positive-strong={row.rowStatus === 'ok'}
                                >
                                    {row.rowStatus}
                                </span>
                            </td>
                            <td class="p-2">
                                <input
                                    type="date"
                                    value={row.date}
                                    onchange={(event) =>
                                        updateRow(index, {
                                            date: (event.currentTarget as HTMLInputElement).value,
                                        })}
                                    class="w-32 rounded border border-line-strong bg-surface px-1"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    type="text"
                                    value={row.opponent}
                                    onchange={(event) =>
                                        updateRow(index, {
                                            opponent: (event.currentTarget as HTMLInputElement).value,
                                        })}
                                    class="w-28 rounded border border-line-strong bg-surface px-1"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    type="number"
                                    min="0"
                                    value={row.listedPrice}
                                    onchange={(event) =>
                                        updateRow(index, {
                                            listedPrice: Number(
                                                (event.currentTarget as HTMLInputElement).value,
                                            ),
                                        })}
                                    class="w-20 rounded border border-line-strong bg-surface px-1"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    type="number"
                                    min="1"
                                    value={row.nbTickets}
                                    onchange={(event) =>
                                        updateRow(index, {
                                            nbTickets: Number(
                                                (event.currentTarget as HTMLInputElement).value,
                                            ),
                                        })}
                                    class="w-16 rounded border border-line-strong bg-surface px-1"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    type="number"
                                    min="0"
                                    value={row.invest}
                                    onchange={(event) =>
                                        updateRow(index, {
                                            invest: Number(
                                                (event.currentTarget as HTMLInputElement).value,
                                            ),
                                        })}
                                    class="w-20 rounded border border-line-strong bg-surface px-1"
                                />
                            </td>
                            <td class="p-2">
                                <select
                                    value={row.status}
                                    onchange={(event) =>
                                        updateRow(index, {
                                            status: (event.currentTarget as HTMLSelectElement)
                                                .value as DraftRow['status'],
                                        })}
                                    class="rounded border border-line-strong bg-surface px-1"
                                >
                                    <option>PENDING</option>
                                    <option>SOLD</option>
                                    <option>CANCELLED</option>
                                </select>
                            </td>
                            <td class="p-2 text-xs">
                                {#each selectedPasses() as pass (pass.id)}
                                    <label class="mr-2 inline-flex items-center gap-1">
                                        <span>{pass.label}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={allocationFor(row, pass.id)}
                                            onchange={(event) =>
                                                updateAllocation(
                                                    index,
                                                    pass.id,
                                                    Number(
                                                        (event.currentTarget as HTMLInputElement).value,
                                                    ),
                                                )}
                                            class="w-12 rounded border border-line-strong bg-surface px-1"
                                        />
                                    </label>
                                {/each}
                                {#if row.nbTickets > 1 && selectedPassIds.length > 1}
                                    <p class="text-xs text-warning-strong">
                                        Split {row.nbTickets} tickets across passes.
                                    </p>
                                {/if}
                            </td>
                            <td class="p-2">
                                <button
                                    type="button"
                                    class="text-xs text-negative-strong"
                                    onclick={() => deleteRow(index)}
                                    aria-label="Delete row"
                                >
                                    ×
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        {#if missingMatches.length > 0}
            <details class="rounded border border-line p-3 text-sm">
                <summary class="cursor-pointer">
                    {missingMatches.length} home matches without a sale
                </summary>
                <ul class="mt-2 flex flex-col gap-1">
                    {#each missingMatches as match (match.matchId)}
                        <li class="flex items-center justify-between">
                            <span>{match.date} · {match.opponentName}</span>
                            <button
                                type="button"
                                class="text-xs underline"
                                onclick={() => addRow(match)}
                            >
                                + add sale
                            </button>
                        </li>
                    {/each}
                </ul>
            </details>
        {/if}

        {#if errorMessage}
            <p class="text-sm text-negative-strong">{errorMessage}</p>
        {/if}

        <footer class="flex justify-end">
            <Button disabled={!canValidate} loading={loading} onclick={validate}>
                Validate
            </Button>
        </footer>
    {/if}
</section>
