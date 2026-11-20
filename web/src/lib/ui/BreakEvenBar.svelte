<script lang="ts">
    let { progress, hasPass }: { progress: number; hasPass: boolean } = $props();

    const percent = $derived(Math.round(Math.min(Math.max(progress, 0), 1) * 100));
</script>

{#if hasPass}
    <div class="flex items-center gap-3">
        <div
            role="progressbar"
            aria-label="Season pass recovered"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={percent}
            class="h-2 flex-1 overflow-hidden rounded-full bg-surface-strong"
        >
            <div class="h-full rounded-full bg-positive" style="width: {percent}%"></div>
        </div>
        <span class="font-mono text-sm text-ink" data-numeric>{percent}%</span>
    </div>
{:else}
    <p class="text-sm text-ink-muted">
        No season pass set.
        <a href="/season" class="text-primary hover:text-primary-hover hover:underline">
            Add one on the Season page
        </a>
    </p>
{/if}
