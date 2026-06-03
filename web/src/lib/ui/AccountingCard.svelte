<script lang="ts">
    import type { Accounting } from '$lib/types';
    import { money, signedMoney, competitionLabel } from '$lib/format';

    let {
        title,
        data,
        showSeason = false,
        variant = 'full',
        tone = 'neutral',
    }: {
        title: string;
        data: Accounting | null;
        showSeason?: boolean;
        variant?: 'full' | 'compact';
        tone?: 'neutral' | 'warning' | 'sunk';
    } = $props();

    const TONE_CLASS: Record<'neutral' | 'warning' | 'sunk', string> = {
        neutral: 'text-ink',
        warning: 'text-warning',
        sunk: 'text-sunk',
    };

    /** Color for Best/Worst money inside the full variant.
     * Neutral tone preserves the signed positive/negative behaviour
     * (realized P&L). Other tones override the sign because the value
     * isn't realized cash, regardless of its arithmetic sign. */
    function moneyTone(profit: number): string {
        if (tone !== 'neutral') {
            return TONE_CLASS[tone];
        }

        return profit < 0 ? 'text-negative' : 'text-positive';
    }

    function seasonOf(iso: string | Date): number {
        const date = typeof iso === 'string' ? new Date(iso) : iso;

        return date.getMonth() < 7 ? date.getFullYear() - 1 : date.getFullYear();
    }
</script>

{#if variant === 'compact'}
    <section class="bg-surface rounded-lg border border-line p-4">
        <header class="flex items-baseline justify-between gap-3">
            <h2 class="text-sm font-semibold text-ink-muted">{title}</h2>
            {#if data}
                <span class="text-xs text-ink-faint">
                    {data.totalNbTickets}
                    {data.totalNbTickets === 1 ? 'ticket' : 'tickets'}
                </span>
            {/if}
        </header>

        {#if !data}
            <p class="mt-2 text-sm text-ink-faint">No data.</p>
        {:else}
            <p
                class="mt-2 font-mono text-2xl font-semibold tracking-tight {TONE_CLASS[
                    tone
                ]}"
            >
                {signedMoney(data.totalProfit)}
            </p>
            <p class="mt-1 text-xs text-ink-muted">
                <span class="font-mono">{money(data.totalSales)}</span> listed value
            </p>
        {/if}
    </section>
{:else}
    <section class="bg-surface rounded-lg border border-line p-5">
        <h2 class="text-base font-semibold tracking-tight text-ink mb-4">
            {title}
        </h2>

        {#if !data}
            <p class="text-sm text-ink-muted">No data.</p>
        {:else}
            <dl class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <dt class="text-ink-muted">Total sales</dt>
                <dd class="text-right font-mono text-ink">{money(data.totalSales)}</dd>

                <dt class="text-ink-muted">Tickets</dt>
                <dd class="text-right font-mono text-ink" data-numeric>
                    {data.totalNbTickets}
                </dd>

                <dt class="text-ink-muted">Avg price</dt>
                <dd class="text-right font-mono text-ink">
                    {money(data.averageTicketPrice)}
                </dd>

                <dt class="text-ink-muted">Avg profit</dt>
                <dd class="text-right font-mono text-ink">
                    {money(data.averageProfit)}
                </dd>
            </dl>

            {#if data.highest?.match}
                <div class="mt-4 pt-4 border-t border-line text-xs text-ink-muted space-y-1.5">
                    <div class="flex flex-wrap items-baseline gap-x-2">
                        <span class="font-medium text-ink">Best</span>
                        <span class="font-mono {moneyTone(data.highest.profit)}">
                            {signedMoney(data.highest.profit)}
                        </span>
                        <span
                            >vs {data.highest.match.opponent} ({competitionLabel(
                                data.highest.match.competition,
                            )}){#if showSeason}, Season {seasonOf(
                                    data.highest.match.date,
                                )}{/if}</span
                        >
                    </div>
                    <div class="flex flex-wrap items-baseline gap-x-2">
                        <span class="font-medium text-ink">Worst</span>
                        <span class="font-mono {moneyTone(data.lowest.profit)}">
                            {signedMoney(data.lowest.profit)}
                        </span>
                        <span
                            >vs {data.lowest.match.opponent} ({competitionLabel(
                                data.lowest.match.competition,
                            )}){#if showSeason}, Season {seasonOf(
                                    data.lowest.match.date,
                                )}{/if}</span
                        >
                    </div>
                </div>
            {/if}
        {/if}
    </section>
{/if}
