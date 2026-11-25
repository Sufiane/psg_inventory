<script lang="ts">
    import type { SubmitFunction } from '@sveltejs/kit';
    import { enhance } from '$app/forms';
    import { dateTime, shortDate, signedMoney } from '$lib/format';
    import { parseAmount, saleNet } from '$lib/sale-math';
    import {
        deleteConfirmMessage,
        isStatusAllowed,
        passCostBasisHint,
        saveConfirmMessage,
    } from '$lib/sale-edit';
    import { passesForSale } from '$lib/sale-passes';
    import { wholeEuroHint } from '$lib/whole-euro';
    import type { SaleDetail, SaleStatus, SeasonPass } from '$lib/types';
    import SaleProfitBlock from '$lib/ui/SaleProfitBlock.svelte';
    import Spinner from '$lib/ui/Spinner.svelte';
    import StatusChip from '$lib/ui/StatusChip.svelte';

    let {
        sale,
        layout,
        passes,
        homeFixtures,
        commissionPercent,
        errorMessage,
        closeHref,
        submitting,
        enhanceSubmit,
    }: {
        sale: SaleDetail;
        layout: 'card' | 'row';
        passes: SeasonPass[];
        homeFixtures: number | null;
        commissionPercent: number | null;
        errorMessage: string | undefined;
        closeHref: string;
        submitting: 'update' | 'delete' | 'create' | null;
        enhanceSubmit: SubmitFunction;
    } = $props();

    const STATUS_OPTIONS: { value: SaleStatus; label: string; tone: string }[] = [
        {
            value: 'SOLD',
            label: 'Sold',
            tone: 'peer-checked:bg-positive/15 peer-checked:text-positive-strong peer-checked:border-positive/50',
        },
        {
            value: 'PENDING',
            label: 'Pending',
            tone: 'peer-checked:bg-warning/15 peer-checked:text-warning-strong peer-checked:border-warning/50',
        },
        {
            value: 'GIFTED',
            label: 'Gifted',
            tone: 'peer-checked:bg-gift/15 peer-checked:text-gift-strong peer-checked:border-gift/50',
        },
        {
            value: 'CANCELLED',
            label: 'Cancelled',
            tone: 'peer-checked:bg-sunk/15 peer-checked:text-sunk-strong peer-checked:border-sunk/50',
        },
    ];

    let draftStatus = $derived<SaleStatus>(sale.status);
    let draftListedPrice = $derived(String(sale.listedPrice));
    let draftInvest = $derived(String(sale.invest));
    let listedPriceHint = $derived(wholeEuroHint(draftListedPrice));
    let investHint = $derived(wholeEuroHint(draftInvest));
    let statusChanged = $derived(draftStatus !== sale.status);
    let matchDate = $derived(new Date(sale.Match.date));
    let isPastMatch = $derived(matchDate.getTime() < Date.now());
    let visiblePasses = $derived(passesForSale(passes, sale));
    let passCostHint = $derived(passCostBasisHint(visiblePasses, sale.Allocations, homeFixtures));
    let investDescribedBy = $derived(
        [
            investHint ? `edit-invest-whole-hint-${layout}` : null,
            passCostHint ? `edit-invest-hint-${layout}` : null,
        ]
            .filter((id) => id !== null)
            .join(' ') || undefined,
    );

    function stepAllocation(event: Event, delta: 1 | -1): void {
        const input = (event.currentTarget as HTMLElement).parentElement?.querySelector('input');

        if (!input) {
            return;
        }

        if (delta === 1) {
            input.stepUp();
        } else {
            input.stepDown();
        }
    }

    function confirmSave(event: Event): void {
        const message = saveConfirmMessage({
            current: sale.status,
            draft: draftStatus,
            opponent: sale.Match.Opponent.name,
            isPastMatch,
            matchDate,
            net: saleNet(sale),
        });

        if (message !== null && !confirm(message)) {
            event.preventDefault();
        }
    }

    function confirmDelete(event: Event): void {
        const message = deleteConfirmMessage({
            opponent: sale.Match.Opponent.name,
            isPastMatch,
            matchDate,
        });

        if (!confirm(message)) {
            event.preventDefault();
        }
    }
</script>

{#snippet allocStepper(pass: SeasonPass, current: number, isFirst: boolean)}
    <div class="inline-flex items-center rounded border border-line-strong bg-surface">
        <button
            type="button"
            aria-label="Remove a ticket from {pass.label}"
            onclick={(event): void => stepAllocation(event, -1)}
            class="size-10 text-ink-muted hover:text-ink transition-colors"
        >
            −
        </button>
        <input
            type="number"
            name={`alloc_${pass.id}`}
            aria-label="Tickets on {pass.label}"
            data-edit-first={isFirst ? '' : undefined}
            min="0"
            step="1"
            value={current}
            class="w-12 bg-transparent text-center text-ink font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
            type="button"
            aria-label="Add a ticket to {pass.label}"
            onclick={(event): void => stepAllocation(event, 1)}
            class="size-10 text-ink-muted hover:text-ink transition-colors"
        >
            +
        </button>
    </div>
{/snippet}

<div
    class="bg-surface-subtle border-t border-line p-4 sm:p-6"
    role="region"
    aria-label="Edit sale vs {sale.Match.Opponent.name}"
>
    <form
        method="POST"
        action="?/update"
        class="mx-auto max-w-2xl space-y-6"
        use:enhance={enhanceSubmit}
    >
        <input type="hidden" name="saleId" value={sale.id} />
        <input
            type="hidden"
            name="intent"
            value={draftStatus === 'GIFTED' ? 'gift' : 'edit-numbers'}
        />
        {#if statusChanged || draftStatus === 'GIFTED'}
            <input type="hidden" name="status" value={draftStatus} />
        {/if}
        <input type="hidden" name="previousStatus" value={sale.status} />

        <header class="flex items-start justify-between gap-4">
            <div class="space-y-1">
                <p
                    class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted"
                >
                    Edit sale
                    <span aria-hidden="true">·</span>
                    <StatusChip status={sale.status} />
                </p>
                <h2 class="text-xl font-semibold text-ink">
                    PSG vs {sale.Match.Opponent.name}, {shortDate(matchDate)}
                </h2>
                <p class="text-sm text-ink-muted font-mono">
                    {dateTime(matchDate)}
                </p>
            </div>
            <a
                href={closeHref}
                aria-label="Close edit panel"
                class="size-10 inline-flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-surface-strong transition-colors"
            >
                <span aria-hidden="true" class="text-xl leading-none">×</span>
            </a>
        </header>

        {#if isPastMatch}
            <div
                role="alert"
                class="rounded-lg border border-warning bg-warning/10 px-3 py-2 text-xs text-warning-strong"
            >
                Match has already been played. Saving here rewrites the original
                sale record.
            </div>
        {/if}

        <fieldset class="space-y-2" aria-label="Sale status">
            <legend class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Status
            </legend>
            <div
                class="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-lg border border-line bg-surface p-1"
            >
                {#each STATUS_OPTIONS as option (option.value)}
                    <label class="relative block">
                        <input
                            type="radio"
                            name="statusChoice"
                            value={option.value}
                            bind:group={draftStatus}
                            disabled={!isStatusAllowed(sale.status, option.value, isPastMatch)}
                            class="peer sr-only"
                        />
                        <span
                            class="flex min-h-10 items-center justify-center rounded border border-transparent px-3 text-sm text-ink-muted transition-colors cursor-pointer hover:text-ink peer-checked:font-medium {option.tone} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:cursor-not-allowed peer-disabled:opacity-40 peer-disabled:hover:text-ink-muted"
                        >
                            {option.label}
                        </span>
                    </label>
                {/each}
            </div>
            {#if sale.status === 'GIFTED'}
                <p class="text-xs text-ink-faint">
                    A gifted sale is final. The recipient can still be changed.
                </p>
            {:else if statusChanged && draftStatus === 'SOLD'}
                <p class="text-xs text-ink-faint">
                    {sale.status === 'CANCELLED'
                        ? 'Restores this sale and credits realized profit.'
                        : 'Adds this sale to realized profit on the dashboard.'}
                </p>
            {:else if statusChanged && draftStatus === 'PENDING'}
                <p class="text-xs text-ink-faint">
                    Removes {signedMoney(saleNet(sale))} from realized net profit.
                </p>
            {:else if statusChanged && draftStatus === 'GIFTED'}
                <p class="text-xs text-ink-faint">
                    Records this ticket as given away. Stays out of realized profit.
                </p>
            {/if}
        </fieldset>

        <fieldset class="space-y-2">
            <legend class="text-sm text-ink-muted">Tickets per pass</legend>
            {#if visiblePasses.length === 0}
                <p class="text-xs text-negative">
                    No season pass for this sale's season — <a
                        data-edit-first
                        href="/season"
                        class="text-primary hover:text-primary-hover hover:underline"
                        >create one</a
                    > to change its allocations.
                </p>
            {:else}
                {#each visiblePasses as pass, idx (pass.id)}
                    {@const current =
                        sale.Allocations?.find(
                            (alloc) => alloc.seasonPassId === pass.id,
                        )?.nbTickets ?? 0}
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-sm text-ink-muted truncate">
                            {pass.seasonStartYear} · {pass.label}
                            <span class="text-ink-faint"
                                >({pass.category} · {pass.row}/{pass.seat})</span
                            >
                        </span>
                        {@render allocStepper(pass, current, idx === 0)}
                    </div>
                {/each}
            {/if}
        </fieldset>

        <div class="grid sm:grid-cols-2 gap-4">
            <div class="space-y-1">
                <label for="edit-listed-price-{layout}" class="block text-sm text-ink-muted">
                    Listed price
                </label>
                <div class="relative">
                    <input
                        id="edit-listed-price-{layout}"
                        type="number"
                        name="listedPrice"
                        min="1"
                        step="1"
                        inputmode="numeric"
                        value={draftListedPrice}
                        oninput={(event): void => {
                            draftListedPrice = event.currentTarget.value;
                        }}
                        aria-describedby={listedPriceHint
                            ? `edit-listed-price-hint-${layout}`
                            : undefined}
                        class="w-full min-h-11 rounded border border-line-strong bg-surface text-ink pl-3 pr-8 font-mono"
                    />
                    <span
                        aria-hidden="true"
                        class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-faint"
                        >€</span
                    >
                </div>
                {#if listedPriceHint}
                    <p id="edit-listed-price-hint-{layout}" class="text-xs text-negative">
                        {listedPriceHint}
                    </p>
                {/if}
            </div>

            <div class="space-y-1">
                <label for="edit-invest-{layout}" class="block text-sm text-ink-muted">
                    Ticket invest
                </label>
                <div class="relative">
                    <input
                        id="edit-invest-{layout}"
                        type="number"
                        name="invest"
                        min="0"
                        step="1"
                        inputmode="numeric"
                        value={draftInvest}
                        oninput={(event): void => {
                            draftInvest = event.currentTarget.value;
                        }}
                        aria-describedby={investDescribedBy}
                        class="w-full min-h-11 rounded border border-line-strong bg-surface text-ink pl-3 pr-8 font-mono"
                    />
                    <span
                        aria-hidden="true"
                        class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-faint"
                        >€</span
                    >
                </div>
                {#if investHint}
                    <p id="edit-invest-whole-hint-{layout}" class="text-xs text-negative">
                        {investHint}
                    </p>
                {/if}
                {#if passCostHint}
                    <p id="edit-invest-hint-{layout}" class="text-xs text-ink-faint">
                        {passCostHint}
                    </p>
                {/if}
            </div>

            {#if draftStatus === 'SOLD'}
                <div class="space-y-1">
                    <span class="block text-sm text-ink-muted">Sold date</span>
                    <p
                        class="flex min-h-11 items-center rounded border border-line bg-surface px-3 text-ink font-mono"
                    >
                        {#if sale.status === 'SOLD' && sale.soldAt}
                            {dateTime(sale.soldAt)}
                        {:else}
                            Set when you save
                        {/if}
                    </p>
                </div>
            {/if}
        </div>

        {#if draftStatus === 'GIFTED'}
            <div class="space-y-1">
                <label for="edit-recipient-{layout}" class="block text-sm text-ink-muted">
                    Recipient
                    {#if sale.status !== 'GIFTED'}
                        <span class="text-ink-faint">(required)</span>
                    {/if}
                </label>
                <!-- datalist#recipient-options lives in the sales page -->
                <input
                    id="edit-recipient-{layout}"
                    type="text"
                    name="recipientName"
                    list="recipient-options"
                    required={sale.status !== 'GIFTED'}
                    autocomplete="off"
                    maxlength="120"
                    placeholder={sale.Gift?.Recipient.name ?? 'e.g. Lucas'}
                    class="w-full min-h-11 rounded border border-line-strong bg-surface text-ink px-3"
                />
                <p class="text-xs text-ink-faint">
                    {#if sale.status === 'GIFTED'}
                        Given to {sale.Gift?.Recipient.name}. Leave blank to keep
                        the current recipient.
                    {:else}
                        Type a new name to add them.
                    {/if}
                </p>
            </div>
        {/if}

        {#if commissionPercent !== null && (draftStatus === 'SOLD' || draftStatus === 'PENDING')}
            <SaleProfitBlock
                listedPrice={parseAmount(draftListedPrice)}
                invest={parseAmount(draftInvest)}
                commissionPercent={commissionPercent}
            />
        {/if}

        {#if errorMessage}
            <p role="alert" class="text-sm text-negative">
                {errorMessage}
            </p>
        {/if}

        <div class="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button
                type="submit"
                formaction="?/delete"
                formnovalidate
                disabled={submitting !== null}
                class="min-h-11 px-1 text-sm text-negative hover:text-negative-strong hover:underline disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
                onclick={confirmDelete}
            >
                {#if submitting === 'delete'}
                    <Spinner size="1em" />
                {/if}
                Delete sale
            </button>

            <a
                href={closeHref}
                class="ml-auto min-h-11 inline-flex items-center rounded border border-line-strong px-4 text-sm text-ink-muted hover:text-ink hover:bg-surface-strong transition-colors"
            >
                Cancel <kbd
                    class="ml-2 font-mono text-[10px] text-ink-faint"
                    aria-hidden="true">Esc</kbd
                >
            </a>

            <button
                type="submit"
                disabled={submitting !== null}
                class="min-h-11 rounded bg-brand text-on-brand px-4 text-sm font-medium hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
                onclick={confirmSave}
            >
                {#if submitting === 'update'}
                    <Spinner size="1em" />
                {/if}
                Save changes
            </button>
        </div>
    </form>
</div>
