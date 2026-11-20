<script lang="ts">
    import Skeleton from './Skeleton.svelte';
</script>

<section
    class="skeleton-card bg-surface rounded-lg border border-line p-6 mb-6"
    aria-busy="true"
    aria-live="polite"
>
    <h2 class="text-sm font-medium text-ink-muted">Net realized profit</h2>
    <div class="mt-1 mb-5">
        <Skeleton width="55%" height="3rem" />
    </div>
    <div class="max-w-md grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {#each Array(3) as _, i (i)}
            <Skeleton width="60%" height="0.85rem" />
            <div class="flex justify-end">
                <Skeleton width="40%" height="0.85rem" />
            </div>
        {/each}
    </div>
</section>
