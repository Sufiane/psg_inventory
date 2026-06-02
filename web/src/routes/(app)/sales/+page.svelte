<script lang="ts">
  import type { PageData } from './$types';
  import { money } from '$lib/format';

  let { data }: { data: PageData } = $props();
</script>

<div class="flex items-center justify-between mb-6">
  <h1 class="text-2xl font-semibold">Sales</h1>
  <a
    href="/sales/new"
    class="rounded bg-blue-600 text-white px-3 py-1.5 text-sm hover:bg-blue-700"
  >
    + New sale
  </a>
</div>

{#if data.sales.length === 0}
  <p class="text-slate-400 text-sm">No sales yet.</p>
{:else}
  <div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
        <tr>
          <th class="text-left px-4 py-2">Opponent</th>
          <th class="text-right px-4 py-2">Tickets</th>
          <th class="text-right px-4 py-2">Price</th>
          <th class="text-right px-4 py-2">Invest</th>
          <th class="text-right px-4 py-2">Profit</th>
          <th class="text-left px-4 py-2">Status</th>
          <th class="px-4 py-2"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each data.sales as sale (sale.id)}
          <tr>
            <td class="px-4 py-2">{sale.opponent.name}</td>
            <td class="px-4 py-2 text-right">{sale.nbTickets}</td>
            <td class="px-4 py-2 text-right">{money(sale.listedPrice)}</td>
            <td class="px-4 py-2 text-right">{money(sale.invest)}</td>
            <td class="px-4 py-2 text-right {sale.profit < 0 ? 'text-red-600' : 'text-emerald-600'}">
              {money(sale.profit)}
            </td>
            <td class="px-4 py-2">
              <span class="inline-block px-2 py-0.5 rounded text-xs
                {sale.status === 'SOLD' ? 'bg-emerald-100 text-emerald-700' : ''}
                {sale.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : ''}
                {sale.status === 'CANCELLED' ? 'bg-slate-100 text-slate-600' : ''}">
                {sale.status}
              </span>
            </td>
            <td class="px-4 py-2 text-right">
              <a href="/sales/{sale.id}" class="text-blue-600 hover:underline">Edit</a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
