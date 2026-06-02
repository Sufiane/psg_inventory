<script lang="ts">
  import type { PageData } from './$types';
  import { competitionLabel, dateTime } from '$lib/format';

  let { data }: { data: PageData } = $props();
</script>

<a href="/matches" class="text-sm text-blue-600 hover:underline">&larr; Matches</a>

<h1 class="text-2xl font-semibold mt-2 mb-6">
  PSG {data.match.atHome ? 'vs' : '@'} {data.match.opponent}
</h1>

<div class="bg-white rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
  <div><span class="text-slate-500">Date:</span> {dateTime(data.match.date)}</div>
  <div><span class="text-slate-500">Competition:</span> {competitionLabel(data.match.competition)}</div>
  <div><span class="text-slate-500">Venue:</span> {data.match.atHome ? 'Home' : 'Away'}</div>
  {#if data.match.result?.score}
    <div>
      <span class="text-slate-500">Result:</span>
      <span class="font-mono {data.match.result.isWin ? 'text-emerald-600' : 'text-red-600'}">
        {data.match.result.score}
      </span>
      {data.match.result.isWin ? '(Win)' : '(Loss/Draw)'}
    </div>
  {/if}

  <div class="pt-3">
    <a
      href="/sales/new?matchId={data.match.id}"
      class="inline-block rounded bg-blue-600 text-white px-3 py-1.5 text-sm hover:bg-blue-700"
    >
      Add sale for this match
    </a>
  </div>
</div>
