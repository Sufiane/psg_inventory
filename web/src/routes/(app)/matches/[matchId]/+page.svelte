<script lang="ts">
    import type { PageData } from './$types';
    import { competitionLabel, dateTime, money, signedMoney, shortDate } from '$lib/format';
    import { statusPill, profitTone } from '$lib/sale-helpers';

    let { data }: { data: PageData } = $props();

    let totalProfit = $derived(
        data.sales.reduce((sum, s) => sum + s.profit, 0),
    );
</script>

<a
    href="/matches"
    class="text-sm text-primary font-medium hover:text-primary-hover hover:underline"
    >&larr; Matches</a
>

<h1 class="text-2xl font-semibold tracking-tight text-ink mt-2 mb-6">
    PSG {data.match.atHome ? 'vs' : '@'} {data.match.opponent}
</h1>

<div class="bg-surface rounded-lg border border-line p-4 space-y-2 text-sm">
    <div>
        <span class="text-ink-muted">Date:</span>
        <span class="text-ink">{dateTime(data.match.date)}</span>
    </div>
    <div>
        <span class="text-ink-muted">Competition:</span>
        <span class="text-ink">{competitionLabel(data.match.competition)}</span>
    </div>
    <div>
        <span class="text-ink-muted">Venue:</span>
        <span class="text-ink">{data.match.atHome ? 'Home' : 'Away'}</span>
    </div>
    {#if data.match.result?.score}
        <div>
            <span class="text-ink-muted">Result:</span>
            <span
                class="font-mono {data.match.result.isWin
                    ? 'text-positive'
                    : 'text-negative'}"
            >
                {data.match.result.score}
            </span>
            <span class="text-ink-muted"
                >({data.match.result.isWin ? 'Win' : 'Loss / Draw'})</span
            >
        </div>
    {/if}

    <div class="pt-3">
        <a
            href="/sales/new?matchId={data.match.id}"
            class="inline-block rounded bg-primary text-surface px-3 py-1.5 text-sm font-medium hover:bg-primary-hover transition-colors"
        >
            Add sale for this match
        </a>
    </div>
</div>

<!-- Sales section -->
<div class="mt-6">
    <div class="flex items-baseline justify-between gap-3 mb-3">
        <h2 class="text-lg font-semibold tracking-tight text-ink">Sales</h2>
        {#if data.sales.length > 0}
            <p class="text-sm text-ink-muted">
                {data.sales.length} sale{data.sales.length === 1 ? '' : 's'}
                <span class="text-ink-faint">·</span>
                {signedMoney(totalProfit)} total profit
            </p>
        {/if}
    </div>

    {#if data.sales.length === 0}
        <p class="text-ink-faint text-sm">No sales recorded yet.</p>
    {:else}
        <!-- Desktop table -->
        <div class="hidden sm:block bg-surface rounded-lg border border-line overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-surface-subtle text-ink-muted text-xs">
                    <tr>
                        <th class="text-left px-4 py-2 font-medium">Status</th>
                        <th class="text-right px-4 py-2 font-medium">Listed Price</th>
                        <th class="text-right px-4 py-2 font-medium">Profit</th>
                        <th class="text-right px-4 py-2 font-medium">Tickets</th>
                        <th class="text-left px-4 py-2 font-medium">Date</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-line">
                    {#each data.sales as sale (sale.id)}
                        <tr>
                            <td class="px-4 py-2">
                                <span
                                    class="inline-block px-2 py-0.5 rounded text-xs font-medium {statusPill(
                                        sale.status,
                                    )}"
                                >
                                    {sale.status}
                                </span>
                            </td>
                            <td class="px-4 py-2 text-right font-mono text-ink">
                                {money(sale.listedPrice)}
                            </td>
                            <td
                                class="px-4 py-2 text-right font-mono {profitTone(
                                    sale.status,
                                    sale.profit,
                                )}"
                            >
                                {signedMoney(sale.profit)}
                            </td>
                            <td class="px-4 py-2 text-right font-mono text-ink">
                                {sale.nbTickets}
                            </td>
                            <td class="px-4 py-2 text-ink">
                                {shortDate(sale.matchDate)}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <!-- Mobile card list -->
        <ul class="grid gap-3 sm:hidden">
            {#each data.sales as sale (sale.id)}
                <li class="bg-surface rounded-lg border border-line p-4 space-y-2">
                    <header class="flex items-baseline justify-between gap-3">
                        <span
                            class="inline-block px-2 py-0.5 rounded text-xs font-medium {statusPill(
                                sale.status,
                            )}"
                        >
                            {sale.status}
                        </span>
                        <span class="text-xs text-ink-faint">{shortDate(sale.matchDate)}</span>
                    </header>
                    <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <dt class="text-ink-muted">Listed Price</dt>
                        <dd class="text-right font-mono text-ink">
                            {money(sale.listedPrice)}
                        </dd>
                        <dt class="text-ink-muted">Profit</dt>
                        <dd
                            class="text-right font-mono {profitTone(
                                sale.status,
                                sale.profit,
                            )}"
                        >
                            {signedMoney(sale.profit)}
                        </dd>
                        <dt class="text-ink-muted">Tickets</dt>
                        <dd class="text-right font-mono text-ink">{sale.nbTickets}</dd>
                    </dl>
                </li>
            {/each}
        </ul>
    {/if}
</div>
