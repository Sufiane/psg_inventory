<script lang="ts">
    type Mode = 'system' | 'light' | 'dark';

    let mode = $state<Mode>('system');

    $effect(() => {
        const stored = localStorage.getItem('theme');

        mode = stored === 'light' || stored === 'dark' ? stored : 'system';
    });

    function apply(next: Mode): void {
        mode = next;

        if (next === 'system') {
            localStorage.removeItem('theme');
            document.documentElement.removeAttribute('data-theme');
        } else {
            localStorage.setItem('theme', next);
            document.documentElement.setAttribute('data-theme', next);
        }
    }

    function cycle(): void {
        const order: Mode[] = ['system', 'light', 'dark'];
        const next = order[(order.indexOf(mode) + 1) % order.length]!;

        apply(next);
    }

    const label = $derived(
        mode === 'system' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark',
    );
    const icon = $derived(mode === 'system' ? '◐' : mode === 'light' ? '☀' : '☾');
</script>

<button
    type="button"
    onclick={cycle}
    class="inline-flex items-center gap-1 rounded px-2 py-2 text-sm text-ink-muted hover:text-ink"
    aria-label="Toggle theme"
    title={`Theme: ${label} (click to cycle)`}
>
    <span aria-hidden="true">{icon}</span>
    <span class="hidden md:inline">{label}</span>
</button>
