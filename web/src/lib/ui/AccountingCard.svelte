<script lang="ts">
  import type { Accounting } from '$lib/types';
  import { money, competitionLabel } from '$lib/format';

  let { title, data }: { title: string; data: Accounting | null } = $props();
</script>

<section class="bg-white rounded-lg border border-slate-200 p-4">
  <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{title}</h2>

  {#if !data}
    <p class="text-slate-400 text-sm">No data.</p>
  {:else}
    <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt class="text-slate-500">Total sales</dt>
      <dd class="text-right font-medium">{money(data.totalSales)}</dd>

      <dt class="text-slate-500">Total profit</dt>
      <dd class="text-right font-medium {data.totalProfit < 0 ? 'text-red-600' : 'text-emerald-600'}">
        {money(data.totalProfit)}
      </dd>

      <dt class="text-slate-500">Total invest</dt>
      <dd class="text-right">{money(data.totalInvest)}</dd>

      <dt class="text-slate-500">Tickets</dt>
      <dd class="text-right">{data.totalNbTickets}</dd>

      <dt class="text-slate-500">Avg price</dt>
      <dd class="text-right">{money(data.averageTicketPrice)}</dd>

      <dt class="text-slate-500">Avg profit</dt>
      <dd class="text-right">{money(data.averageProfit)}</dd>
    </dl>

    {#if data.highest?.match}
      <div class="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
        <div>
          Best: {money(data.highest.profit)} — vs {data.highest.match.opponent}
          ({competitionLabel(data.highest.match.competition)})
        </div>
        <div>
          Worst: {money(data.lowest.profit)} — vs {data.lowest.match.opponent}
          ({competitionLabel(data.lowest.match.competition)})
        </div>
      </div>
    {/if}
  {/if}
</section>
