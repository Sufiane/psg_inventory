<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import { dateTime, signedMoney } from '$lib/format';
    import Spinner from '$lib/ui/Spinner.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    let sale = $derived(data.sale);
    let matchDate = $derived(new Date(sale.Match.date));
    let isPastMatch = $derived(matchDate.getTime() < Date.now());
    let submitting = $state<'update' | 'delete' | null>(null);

    function confirmIfPast(event: Event, action: 'save' | 'delete'): void {
        if (!isPastMatch) {
            return;
        }

        const opponent = sale.Match.Opponent.name;
        const verb = action === 'save' ? 'Save changes to' : 'Delete';
        const ok = confirm(
            `${verb} the ${opponent} sale? The match was on ${dateTime(matchDate)}; this rewrites historical numbers.`,
        );

        if (!ok) {
            event.preventDefault();
        }
    }

    function confirmDelete(event: Event): void {
        if (isPastMatch) {
            confirmIfPast(event, 'delete');

            return;
        }

        const opponent = sale.Match.Opponent.name;

        if (!confirm(`Delete the ${opponent} sale?`)) {
            event.preventDefault();
        }
    }
</script>

<a
    href="/sales"
    class="text-sm text-primary font-medium hover:text-primary-hover hover:underline"
    >&larr; Sales</a
>

<h1 class="text-2xl font-semibold tracking-tight text-ink mt-2 mb-6">
    Sale vs {sale.Match.Opponent.name}
</h1>

{#if isPastMatch}
    <div
        role="alert"
        class="mb-6 rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-warning-strong max-w-lg"
    >
        Match was on <span class="font-mono">{dateTime(matchDate)}</span>. Saving here
        rewrites the original sale record. Continue only if correcting a missed entry.
    </div>
{/if}

<div
    class="bg-surface rounded-lg border border-line p-4 mb-6 text-sm grid grid-cols-2 gap-2 max-w-lg"
>
    <span class="text-ink-muted">Match date</span>
    <span class={isPastMatch ? 'text-warning-strong' : 'text-ink'}>
        {dateTime(matchDate)}
    </span>
    <span class="text-ink-muted">Status</span><span class="text-ink">{sale.status}</span>
    <span class="text-ink-muted">Profit</span>
    <span
        class="font-mono {sale.profit < 0 ? 'text-negative' : 'text-positive'}"
    >
        {signedMoney(sale.profit)}
    </span>
</div>

<form
    method="POST"
    action="?/update"
    class="max-w-lg bg-surface rounded-lg border border-line p-6 space-y-4"
    use:enhance={({ action, cancel }) => {
        const which: 'update' | 'delete' = action.search.includes('delete')
            ? 'delete'
            : 'update';

        if (submitting !== null) {
            cancel();

            return;
        }

        submitting = which;

        return async ({ update }) => {
            await update();
            submitting = null;
        };
    }}
>
    <label class="block">
        <span class="text-sm text-ink-muted">Tickets</span>
        <input
            type="number"
            name="nbTickets"
            min="1"
            step="1"
            value={sale.nbTickets}
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
            value={sale.listedPrice}
            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
        />
    </label>

    <label class="block">
        <span class="text-sm text-ink-muted">Cost paid for tickets (€)</span>
        <input
            type="number"
            name="invest"
            min="0"
            step="0.01"
            value={sale.invest}
            class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2"
        />
    </label>

    <label class="flex items-center gap-2">
        <input
            type="checkbox"
            name="sold"
            checked={sale.status === 'SOLD'}
            class="rounded border-line-strong"
        />
        <span class="text-sm text-ink">Mark as sold</span>
    </label>

    {#if form?.message}
        <p role="alert" class="text-sm text-negative-strong">{form.message}</p>
    {/if}

    <div class="flex items-center gap-3">
        <button
            type="submit"
            disabled={submitting !== null}
            class="rounded bg-primary text-surface px-4 py-2 font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
            onclick={(event) => confirmIfPast(event, 'save')}
        >
            {#if submitting === 'update'}
                <Spinner size="1em" />
            {/if}
            Save changes
        </button>

        <button
            type="submit"
            formaction="?/delete"
            formnovalidate
            disabled={submitting !== null}
            class="rounded border border-negative text-negative-strong px-4 py-2 font-medium hover:bg-negative/5 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
            onclick={confirmDelete}
        >
            {#if submitting === 'delete'}
                <Spinner size="1em" />
            {/if}
            Delete sale
        </button>
    </div>
</form>
