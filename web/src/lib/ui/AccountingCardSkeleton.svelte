<script lang="ts">
    import Skeleton from './Skeleton.svelte';

    let { title }: { title: string } = $props();
</script>

<section
    class="bg-white rounded-lg border border-slate-200 p-4"
    aria-busy="true"
    aria-live="polite"
>
    <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {title}
    </h2>
    <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {#each Array(6) as _, i (i)}
            <Skeleton width="70%" height="0.85rem" />
            <div class="flex justify-end">
                <Skeleton width="50%" height="0.85rem" />
            </div>
        {/each}
    </div>
    <div class="mt-3 pt-3 border-t border-slate-100 space-y-2">
        <Skeleton width="90%" height="0.75rem" />
        <Skeleton width="80%" height="0.75rem" />
    </div>
</section>
