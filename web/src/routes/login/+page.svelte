<script lang="ts">
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<div class="max-w-sm mx-auto mt-16 bg-white rounded-lg shadow-sm border border-slate-200 p-6">
  <h1 class="text-xl font-semibold mb-4">Sign in</h1>

  <form method="POST" class="space-y-4">
    <label class="block">
      <span class="text-sm text-slate-700">Email</span>
      <input
        type="email"
        name="email"
        required
        autocomplete="email"
        value={form?.email ?? ''}
        class="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>

    <label class="block">
      <span class="text-sm text-slate-700">Password</span>
      <input
        type="password"
        name="password"
        required
        autocomplete="current-password"
        class="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>

    {#if form?.message}
      <p class="text-sm text-red-600">{form.message}</p>
    {/if}

    <button
      type="submit"
      class="w-full rounded bg-blue-600 text-white py-2 font-medium hover:bg-blue-700"
    >
      Sign in
    </button>
  </form>
</div>
