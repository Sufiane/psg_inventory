<script lang="ts">
  import type { PageData } from './$types';
  import { competitionLabel, dateTime } from '$lib/format';

  let { data }: { data: PageData } = $props();

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
</script>

<div class="flex items-center justify-between mb-6">
  <h1 class="text-2xl font-semibold">Matches</h1>

  <form method="GET" class="flex items-center gap-2">
    <label class="text-sm text-slate-600" for="year">Season</label>
    <select
      id="year"
      name="year"
      class="rounded border border-slate-300 px-2 py-1 text-sm"
      onchange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      <option value="">Current</option>
      {#each years as year (year)}
        <option value={year} selected={data.year === year}>{year}</option>
      {/each}
    </select>
  </form>
</div>

{#if data.matches.length === 0}
  <p class="text-slate-400 text-sm">No matches.</p>
{:else}
  <ul class="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
    {#each data.matches as match (match.id)}
      <li class="px-4 py-3 flex items-center gap-3 text-sm">
        <span class="w-32 text-slate-500">{dateTime(match.date)}</span>
        <span class="flex-1">
          {match.atHome ? 'vs' : '@'}
          <strong>{match.opponent}</strong>
        </span>
        <span class="text-slate-400 text-xs w-32">{competitionLabel(match.competition)}</span>
        {#if match.result?.score}
          <span class="font-mono text-xs {match.result.isWin ? 'text-emerald-600' : 'text-red-600'}">
            {match.result.score}
          </span>
        {/if}
        <a href="/matches/{match.id}" class="text-blue-600 hover:underline">View</a>
      </li>
    {/each}
  </ul>
{/if}
