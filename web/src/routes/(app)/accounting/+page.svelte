<script lang="ts">
  import type { PageData } from './$types';
  import AccountingCard from '$lib/ui/AccountingCard.svelte';
  import { money } from '$lib/format';

  let { data }: { data: PageData } = $props();

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  let tab = $derived(data.view);
  let realizedProfit = $derived(data.accounting.realized?.totalProfit ?? 0);
  let seasonInvest = $derived(data.accounting.totalSeasonInvestment);
  let netProfit = $derived(realizedProfit - seasonInvest);
</script>

<h1 class="text-2xl font-semibold mb-6">Accounting</h1>

<div class="flex items-center gap-2 mb-6">
  <a
    href="/accounting?view=current"
    class="px-3 py-1.5 text-sm rounded border {tab === 'current' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-700'}"
  >
    Current season
  </a>
  <a
    href="/accounting?view=all-time"
    class="px-3 py-1.5 text-sm rounded border {tab === 'all-time' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-700'}"
  >
    All time
  </a>

  <form method="GET" class="flex items-center gap-2 ml-2">
    <input type="hidden" name="view" value="season" />
    <select
      name="year"
      class="rounded border border-slate-300 px-2 py-1 text-sm"
      onchange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      <option value="">Pick season…</option>
      {#each years as year (year)}
        <option value={year} selected={data.year === year}>{year}</option>
      {/each}
    </select>
  </form>
</div>

<section class="bg-white rounded-lg border border-slate-200 p-4 mb-6">
  <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
    Net realized profit
  </h2>
  <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm max-w-md">
    <dt class="text-slate-500">Realized profit</dt>
    <dd class="text-right font-mono {realizedProfit < 0 ? 'text-red-600' : 'text-emerald-600'}">
      {money(realizedProfit)}
    </dd>

    <dt class="text-slate-500">
      Season investment{tab === 'all-time' ? ' (all seasons)' : ''}
    </dt>
    <dd class="text-right font-mono text-slate-700">−{money(seasonInvest)}</dd>

    <dt class="text-slate-900 font-medium pt-2 border-t border-slate-100">Net</dt>
    <dd
      class="text-right pt-2 border-t border-slate-100 font-mono font-semibold {netProfit < 0
        ? 'text-red-600'
        : 'text-emerald-600'}"
    >
      {money(netProfit)}
    </dd>
  </dl>

  {#if data.accounting.seasonInvestment}
    <p class="mt-3 text-xs text-slate-500">
      Season {data.accounting.seasonInvestment.seasonStartYear}
      {#if data.accounting.seasonInvestment.category}
        · {data.accounting.seasonInvestment.category}
      {/if}
      {#if data.accounting.seasonInvestment.row}
        · Row {data.accounting.seasonInvestment.row}
      {/if}
      {#if data.accounting.seasonInvestment.seat}
        · Seat {data.accounting.seasonInvestment.seat}
      {/if}
    </p>
  {:else if tab !== 'all-time'}
    <p class="mt-3 text-xs text-slate-500">
      No season pass recorded.
      <a href="/season?year={data.year ?? new Date().getFullYear()}" class="text-blue-600 hover:underline"
        >Set it on the Season tab.</a
      >
    </p>
  {/if}
</section>

<div class="grid md:grid-cols-3 gap-4">
  <AccountingCard title="Realized" data={data.accounting.realized} />
  <AccountingCard title="Unrealized" data={data.accounting.unrealized} />
  <AccountingCard title="Pending" data={data.accounting.pending} />
</div>
