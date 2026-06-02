<script lang="ts">
  import type { PageData } from './$types';
  import AccountingCard from '$lib/ui/AccountingCard.svelte';
  import { competitionLabel, dateTime } from '$lib/format';

  let { data }: { data: PageData } = $props();

  let upcoming = $derived(
    data.matches
      .filter((match) => new Date(match.date) >= new Date())
      .slice(0, 5),
  );
</script>

<h1 class="text-2xl font-semibold mb-6">Current season</h1>

<div class="grid md:grid-cols-3 gap-4 mb-8">
  <AccountingCard title="Realized" data={data.accounting.realized} />
  <AccountingCard title="Unrealized" data={data.accounting.unrealized} />
  <AccountingCard title="Pending" data={data.accounting.pending} />
</div>

<section class="bg-white rounded-lg border border-slate-200 p-4">
  <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
    Upcoming matches
  </h2>

  {#if upcoming.length === 0}
    <p class="text-slate-400 text-sm">No upcoming matches.</p>
  {:else}
    <ul class="divide-y divide-slate-100">
      {#each upcoming as match (match.id)}
        <li class="py-2 flex items-center gap-3 text-sm">
          <span class="w-32 text-slate-500">{dateTime(match.date)}</span>
          <span class="flex-1">
            {match.atHome ? 'vs' : '@'}
            <strong>{match.opponent}</strong>
          </span>
          <span class="text-slate-400 text-xs">{competitionLabel(match.competition)}</span>
          <a href="/matches/{match.id}" class="text-blue-600 hover:underline">View</a>
        </li>
      {/each}
    </ul>
  {/if}
</section>
