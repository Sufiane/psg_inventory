<script lang="ts">
    import { signedMoney } from '$lib/format';

    type Props = {
        played: number;
        total: number;
        sold: number;
        pending: number;
        gifted: number;
        net: number | null;
    };

    let { played, total, sold, pending, gifted, net }: Props = $props();
</script>

<dl
    class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-px overflow-hidden rounded-lg border border-line bg-line"
>
    <div class="bg-surface px-4 py-3">
        <dt class="text-xs text-ink-muted">Matches played</dt>
        <dd class="mt-1 font-mono text-lg text-ink" data-numeric>
            {played}<span class="text-ink-faint"> / {total}</span>
        </dd>
    </div>
    <div class="bg-surface px-4 py-3">
        <dt class="text-xs text-ink-muted">Tickets sold</dt>
        <dd class="mt-1 font-mono text-lg text-positive-strong" data-numeric>{sold}</dd>
    </div>
    <div class="bg-surface px-4 py-3">
        <dt class="text-xs text-ink-muted">Tickets pending</dt>
        <dd class="mt-1 font-mono text-lg text-warning-strong" data-numeric>{pending}</dd>
    </div>
    <div class="bg-surface px-4 py-3">
        <dt class="text-xs text-ink-muted">Tickets gifted</dt>
        <dd class="mt-1 font-mono text-lg text-gift-strong" data-numeric>{gifted}</dd>
    </div>
    <div class="bg-surface px-4 py-3 col-span-2 sm:col-span-1">
        <dt class="text-xs text-ink-muted">Net profit</dt>
        <dd
            class="mt-1 font-mono text-lg {net !== null && net < 0
                ? 'text-negative'
                : 'text-ink'}"
            data-numeric
        >
            {net === null ? '—' : signedMoney(net)}
        </dd>
    </div>
</dl>
