<script lang="ts">
    import type { StatusTab } from '$lib/sales-view';
    import Button from './Button.svelte';
    import FilterTabs from './FilterTabs.svelte';

    type Props = {
        tabs: StatusTab[];
        canCreate: boolean;
        showActions: boolean;
        newHref: string;
        onImport: () => void;
    };

    let { tabs, canCreate, showActions, newHref, onImport }: Props = $props();
</script>

<div class="mb-6 grid gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-2xl font-semibold tracking-tight text-ink">Sales</h1>

        {#if showActions}
            <div class="flex items-center gap-3">
                <button
                    type="button"
                    onclick={onImport}
                    class="min-h-11 rounded border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink hover:border-ink transition-colors"
                >
                    Import CSV
                </button>
                {#if canCreate}
                    <Button href={newHref}>Log sale</Button>
                {:else}
                    <span class="text-sm text-ink-faint">
                        Can't add new sales for this season here — use Import CSV
                        instead.
                    </span>
                {/if}
            </div>
        {/if}
    </div>

    <FilterTabs label="Status" {tabs} />
</div>
