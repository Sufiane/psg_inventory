<script lang="ts">
    import Skeleton from './Skeleton.svelte';

    let {
        title,
        variant = 'full',
    }: { title: string; variant?: 'full' | 'compact' } = $props();
</script>

{#if variant === 'compact'}
    <section
        class="skeleton-card bg-surface rounded-lg border border-line p-4"
        aria-busy="true"
        aria-live="polite"
    >
        <header class="flex items-baseline justify-between gap-3">
            <h2 class="text-sm font-semibold text-ink-muted">{title}</h2>
            <Skeleton width="4rem" height="0.75rem" />
        </header>
        <div class="mt-2">
            <Skeleton width="60%" height="1.75rem" />
        </div>
        <div class="mt-2">
            <Skeleton width="50%" height="0.75rem" />
        </div>
    </section>
{:else}
    <section
        class="skeleton-card bg-surface rounded-lg border border-line p-5"
        aria-busy="true"
        aria-live="polite"
    >
        <h2 class="text-base font-semibold tracking-tight text-ink mb-4">
            {title}
        </h2>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {#each Array(4) as _, i (i)}
                <Skeleton width="70%" height="0.85rem" />
                <div class="flex justify-end">
                    <Skeleton width="50%" height="0.85rem" />
                </div>
            {/each}
        </div>
        <div class="mt-4 pt-4 border-t border-line space-y-1.5">
            <Skeleton width="90%" height="0.75rem" />
            <Skeleton width="80%" height="0.75rem" />
        </div>
    </section>
{/if}
