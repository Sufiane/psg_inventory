<script lang="ts">
    import type { Snippet } from 'svelte';
    import Spinner from './Spinner.svelte';

    type Props = {
        children: Snippet;
        variant?: 'primary' | 'secondary';
        href?: string;
        type?: 'button' | 'submit' | 'reset';
        disabled?: boolean;
        loading?: boolean;
        fullWidth?: boolean;
        class?: string;
        ariaLabel?: string;
        onclick?: (event: MouseEvent) => void;
    };

    let {
        children,
        variant = 'primary',
        href,
        type = 'button',
        disabled = false,
        loading = false,
        fullWidth = false,
        class: extraClass = '',
        ariaLabel,
        onclick,
    }: Props = $props();

    const variants = {
        primary: 'bg-brand text-on-brand hover:bg-brand-hover',
        secondary: 'border border-line-strong bg-transparent text-ink hover:bg-surface-strong',
    };

    const className = $derived(
        [
            'inline-flex items-center justify-center gap-2 min-h-11 rounded',
            variants[variant],
            'px-3.5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
            fullWidth ? 'w-full' : '',
            extraClass,
        ]
            .filter(Boolean)
            .join(' '),
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
        {onclick}
    >
        {#if loading}<Spinner size="1em" />{/if}
        {@render children()}
    </button>
{/if}
