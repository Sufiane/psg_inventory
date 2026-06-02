<script lang="ts">
  import type { PageData } from './$types';
  import { money } from '$lib/format';

  let { data }: { data: PageData } = $props();

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
</script>

<div class="flex items-center justify-between mb-6">
  <h1 class="text-2xl font-semibold">Sales</h1>

  <div class="flex items-center gap-3">
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

    <a
      href="/sales/new"
      class="rounded bg-blue-600 text-white px-3 py-1.5 text-sm hover:bg-blue-700"
    >
      + New sale
    </a>
  </div>
</div>

{#if data.sales.length === 0}
  <p class="text-slate-400 text-sm">No sales in this season.</p>
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
