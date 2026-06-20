<script lang="ts">
    import type { Snippet } from 'svelte';
    import Spinner from './Spinner.svelte';

    type Props = {
        children: Snippet;
        href?: string;
        type?: 'button' | 'submit' | 'reset';
        disabled?: boolean;
        loading?: boolean;
        fullWidth?: boolean;
        class?: string;
        ariaLabel?: string;
    };

    let {
        children,
        href,
        type = 'button',
        disabled = false,
        loading = false,
        fullWidth = false,
        class: extraClass = '',
        ariaLabel,
    }: Props = $props();

    const base =
        'inline-flex items-center justify-center gap-2 min-h-11 rounded bg-primary text-surface px-3.5 py-2.5 text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

    const className = $derived(
        [base, fullWidth ? 'w-full' : '', extraClass].filter(Boolean).join(' '),
    );
</script>

{#if href}
    <a {href} class={className} aria-label={ariaLabel}>
        {#if loading}<Spinner size="1em" />{/if}
        {@render children()}
    </a>
{:else}
    <button
        {type}
        class={className}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-label={ariaLabel}
    >
        {#if loading}<Spinner size="1em" />{/if}
        {@render children()}
    </button>
{/if}
