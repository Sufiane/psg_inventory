<script lang="ts">
    import type { ActionData } from './$types';
    import { enhance } from '$app/forms';
    import Button from '$lib/ui/Button.svelte';

    let { form }: { form: ActionData } = $props();
    let submitting = $state(false);
</script>

<div class="px-4">
<div
    class="max-w-sm mx-auto mt-16 bg-surface rounded-lg shadow-sm border border-line p-6"
>
    <h1 class="text-xl font-semibold tracking-tight text-ink mb-1">Sign in</h1>
    <p class="text-sm text-ink-muted mb-4">
        Or
        <a
            href="/register"
            class="text-primary font-medium hover:text-primary-hover hover:underline"
        >
            create an account
        </a>
        if you're new here.
    </p>

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

        <Button type="submit" loading={submitting} fullWidth>Sign in</Button>
    </form>
</div>
</div>
