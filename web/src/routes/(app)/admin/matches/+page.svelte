<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { competitionLabel } from '$lib/format';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
</script>

<h1 class="text-2xl font-semibold mb-6">Admin board</h1>

{#if form?.success}
  <p class="mb-4 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
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
    <h2 class="font-semibold mb-4">Load matches from data provider</h2>

    <form method="POST" action="?/loadCurrent" class="mb-4">
      <button
        type="submit"
        class="rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
      >
        Load current season
      </button>
    </form>

    <form method="POST" action="?/loadSeason" class="flex items-end gap-2">
      <label class="block">
        <span class="text-sm text-slate-700">Season start year</span>
        <select name="year" class="mt-1 rounded border border-slate-300 px-3 py-2">
          {#each years as year (year)}
            <option value={year}>{year}</option>
          {/each}
        </select>
      </label>
      <button
        type="submit"
        class="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
      >
        Load season
      </button>
    </form>
  </section>

  <section class="bg-white rounded-lg border border-slate-200 p-6">
    <h2 class="font-semibold mb-4">Create match manually</h2>

    <form method="POST" action="?/create" class="space-y-3">
      <label class="block">
        <span class="text-sm text-slate-700">Opponent</span>
        <input
          type="text"
          name="opponent"
          required
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>

      <label class="block">
        <span class="text-sm text-slate-700">Date</span>
        <input
          type="datetime-local"
          name="date"
          required
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>

      <label class="flex items-center gap-2">
        <input type="checkbox" name="atHome" class="rounded border-slate-300" />
        <span class="text-sm">At home</span>
      </label>

      <label class="block">
        <span class="text-sm text-slate-700">Competition</span>
        <select
          name="competition"
          required
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        >
          {#each data.competitions as competition (competition)}
            <option value={competition}>{competitionLabel(competition)}</option>
          {/each}
        </select>
      </label>

      <fieldset class="border border-slate-200 rounded p-3">
        <legend class="text-xs text-slate-500 px-1">Result (optional)</legend>
        <label class="block mb-2">
          <span class="text-sm text-slate-700">Score (e.g. "2 - 1")</span>
          <input
            type="text"
            name="score"
            pattern="\d{'{1,2}'} - \d{'{1,2}'}"
            placeholder="2 - 1"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="isWin" class="rounded border-slate-300" />
          <span class="text-sm">Win</span>
        </label>
      </fieldset>

      <button
        type="submit"
        class="rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
      >
        Create match
      </button>
    </form>
  </section>

  <section class="bg-white rounded-lg border border-slate-200 p-6 md:col-span-2">
    <h2 class="font-semibold mb-2">Operations</h2>
    <p class="text-sm text-slate-500 mb-4">
      Cancel unrealized sales whose match has already passed. The cron runs on a schedule;
      this button forces it immediately.
    </p>

    <form method="POST" action="?/cancelStaleSales">
      <button
        type="submit"
        class="rounded bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700"
        onclick={(event) => {
          if (!confirm('Force-cancel stale unrealized sales now?')) {
            event.preventDefault();
          }
        }}
      >
        Cancel stale unrealized sales
      </button>
    </form>
  </section>
</div>
