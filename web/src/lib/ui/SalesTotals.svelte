<script lang="ts">
    import { money, signedMoney } from '$lib/format';
    import type { SalesSummary } from '$lib/sale-math';

    type Props = {
        summary: SalesSummary;
        variant: 'row' | 'block';
        showSeason?: boolean;
    };

    let { summary, variant, showSeason = false }: Props = $props();

    const netTone = $derived(
        summary.netSold > 0
            ? 'text-positive-strong'
            : summary.netSold < 0
              ? 'text-negative-strong'
              : 'text-ink',
    );
</script>

{#if variant === 'row'}
    <tr class="border-t border-line-strong bg-surface-subtle font-medium">
        <td class="px-4 py-3 text-ink">
            Totals
            <div class="text-[0.65rem] font-normal text-ink-faint leading-snug">
                Net before season pass
            </div>
        </td>
        {#if showSeason}
            <td></td>
        {/if}
        <td class="px-4 py-3 text-right font-mono text-ink">{summary.tickets}</td>
        <td></td>
        <td class="px-4 py-3 text-right font-mono text-ink">{money(summary.proceedsSold)}</td>
        <td class="px-4 py-3 text-right font-mono text-ink">{money(summary.investSold)}</td>
        <td class="px-4 py-3 text-right font-mono {netTone}">{signedMoney(summary.netSold)}</td>
        <td></td>
    </tr>
{:else}
    <dl
        class="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-line bg-surface p-4 text-sm"
    >
        <dt class="text-ink-muted">Tickets</dt>
        <dd class="text-right font-mono text-ink">{summary.tickets}</dd>

        <dt class="text-ink-muted">Proceeds (sold)</dt>
        <dd class="text-right font-mono text-ink">{money(summary.proceedsSold)}</dd>

        <dt class="text-ink-muted">Invest (sold)</dt>
        <dd class="text-right font-mono text-ink">{money(summary.investSold)}</dd>

        <dt class="text-ink-muted">Net before season pass</dt>
        <dd class="text-right font-mono {netTone}">{signedMoney(summary.netSold)}</dd>
    </dl>
{/if}
