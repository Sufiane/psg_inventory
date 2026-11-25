<script lang="ts">
    import { netTone } from '$lib/dashboard';
    import { money, percent, signedMoney } from '$lib/format';
    import type { PerTicketFigures as Figures } from '$lib/season-stats';

    let { figures }: { figures: Figures } = $props();

    function toneOf(value: number | null): string {
        return value === null ? 'text-ink' : netTone(value);
    }
</script>

<div class="grid gap-4 sm:grid-cols-3 mb-6">
    <section
        class="bg-surface rounded-lg border border-line p-4"
        aria-labelledby="dashboard-avg-price-heading"
    >
        <h2 id="dashboard-avg-price-heading" class="text-sm font-medium text-ink-muted">
            Average ticket price
        </h2>
        <p class="mt-1 font-mono text-xl font-semibold text-ink" data-numeric>
            {figures.avgTicketPrice === null ? '—' : money(figures.avgTicketPrice)}
        </p>
        <p class="text-xs text-ink-muted">
            {figures.avgTicketPrice === null ? 'No SOLD tickets yet' : 'per ticket, SOLD sales'}
        </p>
    </section>

    <section
        class="bg-surface rounded-lg border border-line p-4"
        aria-labelledby="dashboard-avg-net-heading"
    >
        <h2 id="dashboard-avg-net-heading" class="text-sm font-medium text-ink-muted">
            Average net per match
        </h2>
        <p
            class="mt-1 font-mono text-xl font-semibold {toneOf(figures.avgNetPerMatch)}"
            data-numeric
        >
            {figures.avgNetPerMatch === null ? '—' : signedMoney(figures.avgNetPerMatch)}
        </p>
        <p class="text-xs text-ink-muted">
            {figures.avgNetPerMatch === null
                ? 'No SOLD sales yet'
                : 'per match with a SOLD sale, after ticket invest'}
        </p>
    </section>

    <section
        class="bg-surface rounded-lg border border-line p-4"
        aria-labelledby="dashboard-roi-heading"
    >
        <h2 id="dashboard-roi-heading" class="text-sm font-medium text-ink-muted">ROI</h2>
        <p class="mt-1 font-mono text-xl font-semibold {toneOf(figures.roi)}" data-numeric>
            {figures.roi === null ? '—' : percent(figures.roi)}
        </p>
        <p class="text-xs text-ink-muted">
            {figures.roi === null
                ? 'No ticket invest or season pass recorded'
                : 'net over ticket invest plus season pass'}
        </p>
    </section>
</div>
