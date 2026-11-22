<script lang="ts">
    import { signedMoney, money } from '$lib/format';
    import { computeDraftBreakdown } from '$lib/sale-math';

    let {
        listedPrice,
        invest,
        commissionPercent,
        heading = 'Profit calculation',
    }: {
        listedPrice: number | null;
        invest: number | null;
        commissionPercent: number;
        heading?: string;
    } = $props();

    const uid = $props.id();
    const headingId = `${uid}-heading`;
    const DASH = '—';

    const breakdown = $derived(computeDraftBreakdown(listedPrice, invest, commissionPercent));
    const netTone = $derived.by(() => {
        if (breakdown === null || breakdown.net === 0) {
            return 'text-ink';
        }

        return breakdown.net > 0 ? 'text-positive-strong' : 'text-negative';
    });
</script>

<section
    aria-labelledby={headingId}
    class="rounded-lg border border-line-strong bg-surface p-4"
>
    <header class="flex items-baseline justify-between gap-3">
        <h3 id={headingId} class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {heading}
        </h3>
        <span class="text-xs text-ink-faint">Auto-computed</span>
    </header>

    <dl class="mt-3 text-sm">
        <div class="flex items-baseline justify-between gap-4 py-1">
            <dt class="text-ink-muted">Listed price</dt>
            <dd class="font-mono text-ink" data-numeric>
                {breakdown ? money(breakdown.listedPrice) : DASH}
            </dd>
        </div>
        <div class="flex items-baseline justify-between gap-4 py-1">
            <dt class="text-ink-muted">Minus {commissionPercent}% commission</dt>
            <dd class="font-mono text-ink" data-numeric>
                {breakdown ? signedMoney(-breakdown.commission) : DASH}
            </dd>
        </div>
        <div class="flex items-baseline justify-between gap-4 py-1">
            <dt class="text-ink-muted">= Proceeds</dt>
            <dd class="font-mono text-ink" data-numeric>
                {breakdown ? signedMoney(breakdown.proceeds) : DASH}
            </dd>
        </div>
        <div class="flex items-baseline justify-between gap-4 py-1">
            <dt class="text-ink-muted">Minus ticket invest</dt>
            <dd class="font-mono text-ink" data-numeric>
                {breakdown ? signedMoney(-breakdown.invest) : DASH}
            </dd>
        </div>
        <div
            class="mt-2 flex items-baseline justify-between gap-4 border-t border-line pt-3"
        >
            <dt class="font-medium text-ink">Net on this sale</dt>
            <dd
                class="font-mono text-xl font-semibold {netTone}"
                data-numeric
                data-testid="profit-net"
            >
                {breakdown ? signedMoney(breakdown.net) : DASH}
            </dd>
        </div>
    </dl>
</section>
