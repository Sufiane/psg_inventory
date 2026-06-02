<script lang="ts">
    import Skeleton from './Skeleton.svelte';
</script>

<section
    class="bg-white rounded-lg border border-slate-200 p-4 mb-6"
    aria-busy="true"
    aria-live="polite"
>
    <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Net realized profit
    </h2>
    <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm max-w-md">
        {#each Array(3) as _, i (i)}
            <Skeleton width="60%" height="0.85rem" />
            <div class="flex justify-end">
                <Skeleton width="40%" height="0.85rem" />
            </div>
        {/each}
    </div>
</section>
