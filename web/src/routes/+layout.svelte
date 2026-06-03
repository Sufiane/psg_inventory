<script lang="ts">
    import '../app.css';
    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';
    import { page } from '$app/state';

    let { data, children }: { data: LayoutData; children: Snippet } = $props();
    let user = $derived(data.user);
    let path = $derived(page.url.pathname);

    type NavItem = { href: string; label: string; match: (p: string) => boolean };

    const baseNav: NavItem[] = [
        { href: '/', label: 'Dashboard', match: (p) => p === '/' },
        { href: '/matches', label: 'Matches', match: (p) => p.startsWith('/matches') },
        { href: '/sales', label: 'Sales', match: (p) => p.startsWith('/sales') },
        { href: '/season', label: 'Season', match: (p) => p.startsWith('/season') },
        {
            href: '/accounting',
            label: 'Accounting',
            match: (p) => p.startsWith('/accounting'),
        },
    ];

    const adminNav: NavItem = {
        href: '/admin/matches',
        label: 'Admin',
        match: (p) => p.startsWith('/admin'),
    };

    let nav = $derived(user?.role === 'ADMIN' ? [...baseNav, adminNav] : baseNav);
</script>

{#if user}
    <header class="bg-surface border-b border-line">
        <div class="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
            <a href="/" class="font-semibold tracking-tight text-ink">PSG Inventory</a>
            <nav class="flex items-center gap-1 text-sm" aria-label="Primary">
                {#each nav as item (item.href)}
                    {@const active = item.match(path)}
                    <a
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        class="px-2.5 py-1.5 rounded transition-colors duration-150 {active
                            ? 'text-ink font-medium bg-surface-strong/60'
                            : 'text-ink-muted hover:text-ink'}"
                    >
                        {item.label}
                    </a>
                {/each}
            </nav>
            <div class="ml-auto flex items-center gap-3 text-sm text-ink-muted">
                <span>{user.email}</span>
                <form method="POST" action="/logout">
                    <button
                        type="submit"
                        class="text-primary font-medium hover:text-primary-hover hover:underline"
                    >
                        Sign out
                    </button>
                </form>
            </div>
        </div>
    </header>
{/if}

<main class="max-w-6xl mx-auto px-4 py-6">
    {@render children()}
</main>
