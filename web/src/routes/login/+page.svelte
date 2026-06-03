<script lang="ts">
    import type { ActionData } from './$types';
    import { enhance } from '$app/forms';
    import Spinner from '$lib/ui/Spinner.svelte';

    let { form }: { form: ActionData } = $props();
    let submitting = $state(false);
</script>

<div
    class="max-w-sm mx-auto mt-16 bg-surface rounded-lg shadow-sm border border-line p-6"
>
    <h1 class="text-xl font-semibold tracking-tight text-ink mb-4">Sign in</h1>

    <form
        method="POST"
        class="space-y-4"
        use:enhance={() => {
            submitting = true;

            return async ({ update }) => {
                await update();
                submitting = false;
            };
        }}
    >
        <label class="block">
            <span class="text-sm text-ink-muted">Email</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input
                type="email"
                name="email"
                required
                autocomplete="email"
                autofocus
                value={form?.email ?? ''}
                class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2 transition-colors"
            />
        </label>

        <label class="block">
            <span class="text-sm text-ink-muted">Password</span>
            <input
                type="password"
                name="password"
                required
                autocomplete="current-password"
                class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2 transition-colors"
            />
        </label>

        {#if form?.message}
            <p role="alert" class="text-sm text-negative-strong">{form.message}</p>
        {/if}

        <button
            type="submit"
            disabled={submitting}
            class="w-full rounded bg-primary text-surface py-2 font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors"
        >
            {#if submitting}
                <Spinner size="1em" />
            {/if}
            Sign in
        </button>
    </form>
</div>
