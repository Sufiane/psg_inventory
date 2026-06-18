<script lang="ts">
    import type { ActionData } from './$types';
    import { enhance } from '$app/forms';
    import Spinner from '$lib/ui/Spinner.svelte';

    let { form }: { form: ActionData } = $props();
    let submitting = $state(false);

    let fieldErrors = $derived(form?.fieldErrors ?? {});
</script>

<div
    class="max-w-sm mx-auto mt-16 bg-surface rounded-lg shadow-sm border border-line p-6"
>
    <h1 class="text-xl font-semibold tracking-tight text-ink mb-1">
        Create an account
    </h1>
    <p class="text-sm text-ink-muted mb-4">
        Or
        <a
            href="/login"
            class="text-primary font-medium hover:text-primary-hover hover:underline"
        >
            sign in
        </a>
        if you already have one.
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
        <div class="grid grid-cols-2 gap-3">
            <label class="block">
                <span class="text-sm text-ink-muted">First name</span>
                <input
                    type="text"
                    name="firstName"
                    required
                    autocomplete="given-name"
                    value={form?.firstName ?? ''}
                    aria-invalid={fieldErrors.firstName ? 'true' : undefined}
                    class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2 transition-colors"
                />

                {#if fieldErrors.firstName}
                    <span class="mt-1 block text-xs text-negative-strong">
                        {fieldErrors.firstName}
                    </span>
                {/if}
            </label>

            <label class="block">
                <span class="text-sm text-ink-muted">Last name</span>
                <input
                    type="text"
                    name="lastName"
                    required
                    autocomplete="family-name"
                    value={form?.lastName ?? ''}
                    aria-invalid={fieldErrors.lastName ? 'true' : undefined}
                    class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2 transition-colors"
                />

                {#if fieldErrors.lastName}
                    <span class="mt-1 block text-xs text-negative-strong">
                        {fieldErrors.lastName}
                    </span>
                {/if}
            </label>
        </div>

        <label class="block">
            <span class="text-sm text-ink-muted">Email</span>
            <input
                type="email"
                name="email"
                required
                autocomplete="email"
                value={form?.email ?? ''}
                aria-invalid={fieldErrors.email ? 'true' : undefined}
                class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2 transition-colors"
            />

            {#if fieldErrors.email}
                <span class="mt-1 block text-xs text-negative-strong">
                    {fieldErrors.email}
                </span>
            {/if}
        </label>

        <label class="block">
            <span class="text-sm text-ink-muted">Password</span>
            <input
                type="password"
                name="password"
                required
                minlength="7"
                autocomplete="new-password"
                aria-invalid={fieldErrors.password ? 'true' : undefined}
                class="mt-1 w-full rounded border border-line-strong bg-surface text-ink px-3 py-2 transition-colors"
            />
            <span class="mt-1 block text-xs text-ink-faint">
                At least 7 characters.
            </span>

            {#if fieldErrors.password}
                <span class="mt-1 block text-xs text-negative-strong">
                    {fieldErrors.password}
                </span>
            {/if}
        </label>

        <label class="block">
            <span class="text-sm text-ink-muted">Confirm password</span>
            <input
                type="password"
                name="confirmPassword"
                required
                minlength="7"
                autocomplete="new-password"
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
            Create account
        </button>
    </form>
</div>
