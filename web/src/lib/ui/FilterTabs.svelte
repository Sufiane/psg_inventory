<script lang="ts">
    type Tab = { href: string; label: string; active: boolean };

    let { label, tabs }: { label: string; tabs: Tab[] } = $props();
</script>

<nav aria-label={label} class="no-scrollbar flex items-center gap-1 overflow-x-auto text-sm">
    {#each tabs as tab (tab.href)}
        <a
            href={tab.href}
            aria-current={tab.active ? 'page' : undefined}
            class="shrink-0 min-h-11 inline-flex items-center rounded px-3 transition-colors duration-150 {tab.active
                ? 'bg-surface-strong text-ink font-medium'
                : 'text-ink-muted hover:text-ink hover:bg-surface-strong/60'}"
        >
            {tab.label}
        </a>
    {/each}
</nav>
