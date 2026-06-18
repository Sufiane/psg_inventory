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
        { href: '/dashboard', label: 'Dashboard', match: (p) => p === '/dashboard' },
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
        <div
            class="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
        >
            <a
                href="/dashboard"
                class="font-semibold tracking-tight text-ink shrink-0 mr-auto sm:mr-0"
            >
                PSG Inventory
            </a>

            <div
                class="order-3 sm:order-2 w-full sm:w-auto sm:mr-auto -mx-4 sm:mx-0"
            >
                <nav
                    class="no-scrollbar flex items-center gap-1 text-sm overflow-x-auto px-4 sm:px-0 [-webkit-overflow-scrolling:touch]"
                    aria-label="Primary"
                >
                    {#each nav as item (item.href)}
                        {@const active = item.match(path)}
                        <a
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            class="shrink-0 px-3 py-2 rounded transition-colors duration-150 {active
                                ? 'text-ink font-medium bg-surface-strong/60'
                                : 'text-ink-muted hover:text-ink'}"
                        >
                            {item.label}
                        </a>
                    {/each}
                </nav>
            </div>

            <div class="order-2 sm:order-3 flex items-center gap-3 text-sm text-ink-muted">
                <span class="hidden md:inline truncate max-w-[16ch]" title={user.email}>
                    {user.email}
                </span>
                <form method="POST" action="/logout">
                    <button
                        type="submit"
                        class="text-primary font-medium hover:text-primary-hover hover:underline px-1 py-2"
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
