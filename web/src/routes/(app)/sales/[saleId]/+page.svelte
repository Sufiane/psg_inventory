<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { dateTime, money } from '$lib/format';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    let sale = $derived(data.sale);
    let matchDate = $derived(new Date(sale.Match.date));
    let isPastMatch = $derived(matchDate.getTime() < Date.now());

    function confirmIfPast(event: Event, action: 'save' | 'delete'): void {
        if (!isPastMatch) {
            return;
        }

        const verb = action === 'save' ? 'edit' : 'delete';
        const ok = confirm(
            `This match already took place on ${dateTime(matchDate)}. ` +
                `${verb === 'edit' ? 'Editing' : 'Deleting'} this sale will rewrite historical data. ` +
                `Continue?`,
        );

        if (!ok) {
            event.preventDefault();
        }
    }
</script>

<a href="/sales" class="text-sm text-blue-600 hover:underline">&larr; Sales</a>

<h1 class="text-2xl font-semibold mt-2 mb-6">
    Sale — {sale.Match.Opponent.name}
</h1>

{#if isPastMatch}
    <div
        class="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 max-w-lg"
    >
        <strong>Heads up:</strong> the match for this sale took place on
        <span class="font-mono">{dateTime(matchDate)}</span>. Any changes here will alter
        historical data — only do this to correct an entry that wasn't adjusted in time.
    </div>
{/if}

<div
    class="bg-white rounded-lg border border-slate-200 p-4 mb-6 text-sm grid grid-cols-2 gap-2 max-w-lg"
>
    <span class="text-slate-500">Match date</span>
    <span class={isPastMatch ? 'text-amber-700' : ''}>{dateTime(matchDate)}</span>
    <span class="text-slate-500">Status</span><span>{sale.status}</span>
    <span class="text-slate-500">Profit</span>
    <span class={sale.profit < 0 ? 'text-red-600' : 'text-emerald-600'}
        >{money(sale.profit)}</span
    >
</div>

<form
    method="POST"
    action="?/update"
    class="max-w-lg bg-white rounded-lg border border-slate-200 p-6 space-y-4"
>
    <label class="block">
        <span class="text-sm text-slate-700">Tickets</span>
        <input
            type="number"
            name="nbTickets"
            min="1"
            step="1"
            value={sale.nbTickets}
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
    </label>

    <label class="block">
        <span class="text-sm text-slate-700">Listed price (€)</span>
        <input
            type="number"
            name="listedPrice"
            min="1"
            step="0.01"
            value={sale.listedPrice}
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
    </label>

    <label class="block">
        <span class="text-sm text-slate-700">Invest (€)</span>
        <input
            type="number"
            name="invest"
            min="0"
            step="0.01"
            value={sale.invest}
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
    </label>

    <label class="flex items-center gap-2">
        <input
            type="checkbox"
            name="sold"
            checked={sale.status === 'SOLD'}
            class="rounded border-slate-300"
        />
        <span class="text-sm">Mark as sold</span>
    </label>

    {#if form?.message}
        <p class="text-sm text-red-600">{form.message}</p>
    {/if}

    <div class="flex items-center gap-3">
        <button
            type="submit"
            class="rounded bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700"
            onclick={(event) => confirmIfPast(event, 'save')}
        >
            Save
        </button>

        <button
            type="submit"
            formaction="?/delete"
            formnovalidate
            class="rounded border border-red-300 text-red-600 px-4 py-2 font-medium hover:bg-red-50"
            onclick={(event) => {
                if (isPastMatch) {
                    confirmIfPast(event, 'delete');

                    return;
                }

                if (!confirm('Delete this sale?')) {
                    event.preventDefault();
                }
            }}
        >
            Delete
        </button>
    </div>
</form>
