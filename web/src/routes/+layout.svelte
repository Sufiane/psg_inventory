<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
  let user = $derived(data.user);
</script>

{#if user}
  <header class="bg-white border-b border-slate-200">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
      <a href="/" class="font-semibold text-slate-900">PSG Inventory</a>
      <nav class="flex items-center gap-4 text-sm">
        <a href="/" class="hover:text-blue-600">Dashboard</a>
        <a href="/matches" class="hover:text-blue-600">Matches</a>
        <a href="/sales" class="hover:text-blue-600">Sales</a>
        <a href="/accounting" class="hover:text-blue-600">Accounting</a>
        {#if user.role === 'ADMIN'}
          <a href="/admin/matches" class="hover:text-blue-600">Admin</a>
        {/if}
      </nav>
      <div class="ml-auto flex items-center gap-3 text-sm text-slate-600">
        <span>{user.email}</span>
        <form method="POST" action="/logout">
          <button type="submit" class="text-blue-600 hover:underline">Sign out</button>
        </form>
      </div>
    </div>
  </header>
{/if}

<main class="max-w-6xl mx-auto px-4 py-6">
  {@render children()}
</main>
