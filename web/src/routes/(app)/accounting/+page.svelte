<script lang="ts">
  import type { PageData } from './$types';
  import AccountingCard from '$lib/ui/AccountingCard.svelte';

  let { data }: { data: PageData } = $props();

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  let tab = $derived(data.view);
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

<div class="grid md:grid-cols-3 gap-4">
  <AccountingCard title="Realized" data={data.accounting.realized} />
  <AccountingCard title="Unrealized" data={data.accounting.unrealized} />
  <AccountingCard title="Pending" data={data.accounting.pending} />
</div>
