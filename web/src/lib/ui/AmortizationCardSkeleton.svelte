<script lang="ts">
    import Skeleton from './Skeleton.svelte';
</script>

<section
    class="bg-surface rounded-lg border border-line p-5 max-w-lg"
    aria-busy="true"
    aria-live="polite"
>
    <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-sm font-medium text-ink-muted">Season pass amortization</h2>
        <Skeleton width="4rem" height="0.75rem" />
    </div>
    <div class="mt-1">
        <Skeleton width="45%" height="2rem" />
    </div>
    <div class="mt-0.5">
        <Skeleton width="30%" height="0.75rem" />
    </div>
    <div class="mt-5">
        <Skeleton width="100%" height="0.375rem" />
        <div class="mt-2 flex justify-between">
            <Skeleton width="35%" height="0.75rem" />
            <Skeleton width="2.5rem" height="0.75rem" />
        </div>
    </div>
    <div class="mt-4">
        <Skeleton width="70%" height="0.75rem" />
    </div>
</section>
