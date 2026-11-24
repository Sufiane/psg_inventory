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
    import {
        needsRecipient,
        rowStateClass,
        rowStateLabel,
        rowStateTone,
        summarizeDraft,
    } from '$lib/import-draft';
    import { statusPill } from '$lib/sale-helpers';
    import type { SeasonPass } from '$lib/types';
    import type { TicketCount } from '@psg/shared/counts';
    import type { MatchId, SeasonPassId } from '@psg/shared/ids';
    import type { Invest, ListedPrice } from '@psg/shared/money';
    import type { IsoDateString } from '@psg/shared/time';

    type Props = {
        preview: PreviewResponse;
        selectedPassIds: string[];
        passes: SeasonPass[];
        onCommitted: () => void;
        onBack: () => void;
        onCancel: () => void;
    };

    const { preview, selectedPassIds, passes, onCommitted, onBack, onCancel }: Props = $props();

    let rows = $state<DraftRow[]>(untrack(() => preview.rows.map((row) => ({ ...row }))));
    let missingMatches = $state<MissingMatch[]>(
        untrack(() => [...preview.missingMatches]),
    );
    let loading = $state(false);
    let errorMessage = $state<string | null>(null);
    let commitResult = $state<CommitResult | null>(null);

    const summary = $derived(summarizeDraft(rows));

    const canImport = $derived(rows.length > 0 && summary.errors === 0 && !loading);

    const passLookup = $derived.by(() => {
        const map = new Map<string, SeasonPass>();

        for (const pass of passes) {
            map.set(pass.id, pass);
        }

        return map;
    });

    const inputBaseClass = 'min-h-9 rounded border px-2 text-sm disabled:opacity-50';
    const inputClass = `${inputBaseClass} border-line-strong bg-surface`;
    const inputInvalidClass = `${inputBaseClass} border-negative bg-negative/10`;

    function selectedPasses(): SeasonPass[] {
        return selectedPassIds
            .map((id) => passLookup.get(id))
            .filter((pass): pass is SeasonPass => pass != null);
    }

    // Deliberate duplicate of resolveGiftRecipientStatus in
    // src/api/sales-import/sales-import.resolver.ts — the only import rule the
    // client can check without match/pass data. Keep the two in step.
    function resolveRowStatus(row: DraftRow): DraftRow['rowStatus'] {
        if (needsRecipient(row)) {
            return 'error:gift-recipient-missing';
        }

        return 'ok';
    }

    function updateRow(index: number, patch: Partial<DraftRow>): void {
        rows = rows.map((row, i) => {
            if (i !== index) {
                return row;
            }

            const next = { ...row, ...patch };

            return { ...next, rowStatus: resolveRowStatus(next) };
        });
    }

    function updateAllocation(rowIndex: number, passId: SeasonPassId, count: number): void {
        rows = rows.map((row, i) => {
            if (i !== rowIndex) {
                return row;
            }

            const existing = row.allocations.filter((a) => a.seasonPassId !== passId);
            const next =
                count > 0
                    ? [...existing, { seasonPassId: passId, nbTickets: count as TicketCount }]
                    : existing;

            const patched = { ...row, allocations: next };

            return { ...patched, rowStatus: resolveRowStatus(patched) };
        });
    }

    function allocationFor(row: DraftRow, passId: SeasonPassId): number {
        return row.allocations.find((a) => a.seasonPassId === passId)?.nbTickets ?? 0;
    }

    function deleteRow(index: number): void {
        rows = rows.filter((_, i) => i !== index);
    }

    function addRow(missing: MissingMatch): void {
        const passIds = selectedPassIds;
        const firstPassId = passIds[0];
        const allocations =
            firstPassId != null
                ? [
                      {
                          seasonPassId: firstPassId as SeasonPassId,
                          nbTickets: 1 as TicketCount,
                      },
                  ]
                : [];

        rows = [
            ...rows,
            {
                rowIndex: rows.length,
                date: missing.date,
                opponent: missing.opponentName,
                listedPrice: 0 as ListedPrice,
                nbTickets: 1 as TicketCount,
                invest: 0 as Invest,
                status: 'PENDING',
                matchId: missing.matchId as MatchId,
                allocations,
                rowStatus: 'ok',
            },
        ];
        missingMatches = missingMatches.filter((match) => match.matchId !== missing.matchId);
    }

    async function importRows(): Promise<void> {
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
            errorMessage = 'Import reverted. You can re-import.';
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

<section class="flex min-h-0 flex-col">
    {#if commitResult != null}
        <div class="flex flex-col gap-4 px-6 py-5 text-sm">
            <p role="status">
                <span class="font-semibold text-positive-strong">
                    {commitResult.salesCreated}
                    {commitResult.salesCreated === 1 ? 'sale' : 'sales'} imported.
                </span>
            </p>
            {#if errorMessage}
                <p role="alert" class="text-negative-strong">{errorMessage}</p>
            {/if}
            <div class="flex justify-end gap-3">
                <Button variant="secondary" onclick={undo} loading={loading}>Undo import</Button>
                <Button onclick={finish} disabled={loading}>Done</Button>
            </div>
        </div>
    {:else}
        <div class="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
        <div class="flex items-center justify-between gap-3 text-sm">
            <button
                type="button"
                class="-ml-2 inline-flex min-h-11 items-center px-2 text-ink-muted hover:text-primary disabled:opacity-50"
                disabled={loading}
                onclick={onBack}
            >
                ← Back
            </button>
            <p>
                {#if summary.total === 0}
                    <span class="text-ink-muted">No rows to import</span>
                {:else}
                    {summary.ready}
                    {summary.ready === 1 ? 'row' : 'rows'} ready,
                    <span
                        class={summary.attention > 0 ? 'font-medium text-warning-strong' : 'text-ink-muted'}
                    >
                        {summary.attention} need attention
                    </span>
                {/if}
            </p>
        </div>

        <div class="max-h-96 overflow-auto rounded-lg border border-line">
            <table class="w-full text-sm">
                <thead class="sticky top-0 z-10 bg-surface-subtle text-left text-xs uppercase text-ink-muted">
                    <tr>
                        <th class="p-2">State</th>
                        <th class="p-2">Date</th>
                        <th class="p-2">Opponent</th>
                        <th class="p-2">Price</th>
                        <th class="p-2">Tickets</th>
                        <th class="p-2">Invest</th>
                        <th class="p-2">Sale status</th>
                        <th class="p-2">Recipient</th>
                        <th class="p-2">Sold / gifted at</th>
                        <th class="p-2">Allocations</th>
                        <th class="p-2"><span class="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody>
                    {#each rows as row, index (index)}
                        {@const tone = rowStateTone(row.rowStatus)}
                        {@const recipientMissing = needsRecipient(row)}
                        <tr class="border-t border-line align-top">
                            <td class="p-2 text-xs">
                                <span
                                    class={tone === 'ok'
                                        ? rowStateClass(tone)
                                        : `inline-flex whitespace-nowrap rounded px-2 py-0.5 font-medium ${rowStateClass(tone)}`}
                                >
                                    {rowStateLabel(row.rowStatus)}
                                </span>
                            </td>
                            <td class="p-2">
                                <input
                                    type="date"
                                    aria-label="Date"
                                    value={row.date}
                                    onchange={(event): void =>
                                        updateRow(index, {
                                            date: (event.currentTarget as HTMLInputElement).value,
                                        })}
                                    class="w-36 {inputClass}"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    type="text"
                                    aria-label="Opponent"
                                    value={row.opponent}
                                    onchange={(event): void =>
                                        updateRow(index, {
                                            opponent: (event.currentTarget as HTMLInputElement).value,
                                        })}
                                    class="w-32 {inputClass}"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    type="number"
                                    min="0"
                                    aria-label="Price"
                                    value={row.listedPrice}
                                    onchange={(event): void =>
                                        updateRow(index, {
                                            listedPrice: Number(
                                                (event.currentTarget as HTMLInputElement).value,
                                            ) as ListedPrice,
                                        })}
                                    class="w-20 {inputClass}"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    type="number"
                                    min="1"
                                    aria-label="Tickets"
                                    value={row.nbTickets}
                                    onchange={(event): void =>
                                        updateRow(index, {
                                            nbTickets: Number(
                                                (event.currentTarget as HTMLInputElement).value,
                                            ) as TicketCount,
                                        })}
                                    class="w-16 {inputClass}"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    type="number"
                                    min="0"
                                    aria-label="Invest"
                                    value={row.invest}
                                    onchange={(event): void =>
                                        updateRow(index, {
                                            invest: Number(
                                                (event.currentTarget as HTMLInputElement).value,
                                            ) as Invest,
                                        })}
                                    class="w-20 {inputClass}"
                                />
                            </td>
                            <td class="p-2">
                                <select
                                    aria-label="Sale status"
                                    value={row.status}
                                    onchange={(event): void =>
                                        updateRow(index, {
                                            status: (event.currentTarget as HTMLSelectElement)
                                                .value as DraftRow['status'],
                                        })}
                                    class="min-h-9 rounded border-0 px-2 text-xs font-medium uppercase tracking-wide {statusPill(
                                        row.status,
                                    )}"
                                >
                                    <option>PENDING</option>
                                    <option>SOLD</option>
                                    <option>CANCELLED</option>
                                    <option>GIFTED</option>
                                </select>
                            </td>
                            <td class="p-2">
                                <input
                                    type="text"
                                    aria-label="Recipient"
                                    value={row.recipient ?? ''}
                                    disabled={row.status !== 'GIFTED'}
                                    placeholder={recipientMissing ? 'Recipient required' : 'Name'}
                                    aria-invalid={recipientMissing ? 'true' : undefined}
                                    onchange={(event): void =>
                                        updateRow(index, {
                                            recipient:
                                                (event.currentTarget as HTMLInputElement).value ||
                                                undefined,
                                        })}
                                    class="w-36 {recipientMissing ? inputInvalidClass : inputClass}"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    type="date"
                                    aria-label="Sold or gifted at"
                                    value={row.soldAt ?? ''}
                                    disabled={row.status !== 'SOLD' && row.status !== 'GIFTED'}
                                    title={row.status === 'GIFTED'
                                        ? 'Leave blank to use the match date.'
                                        : undefined}
                                    onchange={(event): void =>
                                        updateRow(index, {
                                            soldAt: ((event.currentTarget as HTMLInputElement)
                                                .value || undefined) as IsoDateString | undefined,
                                        })}
                                    class="w-36 {inputClass}"
                                />
                            </td>
                            <td class="p-2 text-xs">
                                <div class="flex flex-wrap items-center gap-2">
                                    {#each selectedPasses() as pass (pass.id)}
                                        <label class="inline-flex items-center gap-1">
                                            <span>{pass.label}</span>
                                            <input
                                                type="number"
                                                min="0"
                                                value={allocationFor(row, pass.id)}
                                                onchange={(event): void =>
                                                    updateAllocation(
                                                        index,
                                                        pass.id,
                                                        Number(
                                                            (event.currentTarget as HTMLInputElement).value,
                                                        ),
                                                    )}
                                                class="w-14 {inputClass}"
                                            />
                                        </label>
                                    {/each}
                                </div>
                                {#if row.nbTickets > 1 && selectedPassIds.length > 1}
                                    <p class="mt-1 text-xs text-warning-strong">
                                        Split {row.nbTickets} tickets across passes.
                                    </p>
                                {/if}
                            </td>
                            <td class="p-2">
                                <button
                                    type="button"
                                    class="flex min-h-9 min-w-9 items-center justify-center rounded text-negative-strong hover:bg-negative/10"
                                    onclick={(): void => deleteRow(index)}
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
            <details class="rounded-lg border border-line bg-surface text-sm">
                <summary class="min-h-11 cursor-pointer px-4 py-3 font-medium">
                    {missingMatches.length} home matches without a sale
                </summary>
                <ul class="flex flex-col border-t border-line">
                    {#each missingMatches as match (match.matchId)}
                        <li class="flex items-center justify-between gap-3 px-4 py-1">
                            <span>{match.date} · {match.opponentName}</span>
                            <button
                                type="button"
                                class="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary underline"
                                onclick={(): void => addRow(match)}
                            >
                                + add sale
                            </button>
                        </li>
                    {/each}
                </ul>
            </details>
        {/if}

        {#if errorMessage}
            <p role="alert" class="text-sm text-negative-strong">{errorMessage}</p>
        {/if}
        </div>

        <footer class="flex justify-end gap-3 border-t border-line bg-surface-subtle px-6 py-4">
            <Button variant="secondary" onclick={onCancel} disabled={loading}>Cancel</Button>
            <Button disabled={!canImport} loading={loading} onclick={importRows}>
                Import {rows.length}
                {rows.length === 1 ? 'sale' : 'sales'}
            </Button>
        </footer>
    {/if}
</section>
