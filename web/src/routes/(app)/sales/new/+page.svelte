<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { competitionLabel, dateTime } from '$lib/format';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<a href="/sales" class="text-sm text-blue-600 hover:underline">&larr; Sales</a>

<h1 class="text-2xl font-semibold mt-2 mb-6">New sale</h1>

<form method="POST" class="max-w-lg bg-white rounded-lg border border-slate-200 p-6 space-y-4">
  <label class="block">
    <span class="text-sm text-slate-700">Match</span>
    <select
      name="matchId"
      required
      class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
    >
      <option value="">Select a match…</option>
      {#each data.matches as match (match.id)}
        <option value={match.id} selected={data.presetMatchId === match.id}>
          {dateTime(match.date)} — {match.atHome ? 'vs' : '@'} {match.opponent}
          ({competitionLabel(match.competition)})
        </option>
      {/each}
    </select>
  </label>

  <label class="block">
    <span class="text-sm text-slate-700">Number of tickets</span>
    <input
      type="number"
      name="nbTickets"
      min="1"
      step="1"
      required
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
      required
      class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
    />
  </label>

  <label class="block">
    <span class="text-sm text-slate-700">Invest (€, optional)</span>
    <input
      type="number"
      name="invest"
      min="0"
      step="0.01"
      class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
    />
  </label>

  {#if form?.message}
    <p class="text-sm text-red-600">{form.message}</p>
  {/if}

  <button
    type="submit"
    class="rounded bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700"
  >
    Create sale
  </button>
</form>
