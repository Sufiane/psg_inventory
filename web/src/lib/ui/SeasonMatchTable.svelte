<script lang="ts">
    import type { SeasonTableRow } from '$lib/accounting-view';
    import type { SalesSummary } from '$lib/sale-math';
    import type { SaleListItem } from '$lib/types';
    import { saleNet } from '$lib/sale-math';
    import StatusChip from '$lib/ui/StatusChip.svelte';
    import { money, signedMoney, shortDate, competitionLabel } from '$lib/format';

    let { groups, summary }: { groups: SeasonTableRow[]; summary: SalesSummary } = $props();

    function priceText(sale: SaleListItem): string {
        if (sale.status === 'GIFTED' && sale.Gift) {
            return `Gifted to ${sale.Gift.Recipient.name}`;
        }

        return money(sale.listedPrice);
    }

    function netText(sale: SaleListItem): string {
        if (sale.status === 'SOLD') {
            return signedMoney(saleNet(sale));
        }

        return '—';
    }

    function competitionText(value: string): string {
        if (value === '') {
            return '—';
        }

        return competitionLabel(value);
    }

    function summaryTone(value: number): string {
        if (value < 0) {
            return 'text-negative-strong';
        }

        if (value > 0) {
            return 'text-positive-strong';
        }

        return 'text-ink';
    }
</script>

<section aria-labelledby="season-matches-heading" class="mt-6">
    <h2 id="season-matches-heading" class="text-sm font-medium text-ink-muted">
        Matches this season
    </h2>

    <div class="mt-3 overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="border-b border-line text-left text-xs text-ink-faint">
                    <th scope="col" class="py-2 pr-3 font-medium">Match</th>
                    <th scope="col" class="py-2 pr-3 font-medium">Competition</th>
                    <th scope="col" class="py-2 pr-3 text-right font-medium">Tickets</th>
                    <th scope="col" class="py-2 pr-3 text-right font-medium">Listed price</th>
                    <th scope="col" class="py-2 pr-3 text-right font-medium">Invest</th>
                    <th scope="col" class="py-2 pr-3 text-right font-medium">Net</th>
                    <th scope="col" class="py-2 font-medium">Status</th>
                </tr>
            </thead>

            {#if groups.length === 0}
                <tbody>
                    <tr>
                        <td colspan="7" class="py-4 text-ink-muted">No sales this season.</td>
                    </tr>
                </tbody>
            {:else}
                {#each groups as group (group.matchId)}
                    <tbody class="border-b border-line align-top">
                        {#each group.sales as sale (sale.id)}
                            <tr>
                                <th
                                    scope="row"
                                    class="py-2 pr-3 whitespace-nowrap text-left font-normal text-ink"
                                >
                                    {group.opponent}
                                    <span class="text-ink-faint">{shortDate(group.date)}</span>
                                </th>
                                <td class="py-2 pr-3 text-ink-muted">
                                    {competitionText(group.competition)}
                                </td>
                                <td class="py-2 pr-3 text-right font-mono text-ink" data-numeric>
                                    {sale.nbTickets}
                                </td>
                                <td class="py-2 pr-3 text-right font-mono text-ink" data-numeric>
                                    {priceText(sale)}
                                </td>
                                <td class="py-2 pr-3 text-right font-mono text-ink-muted" data-numeric>
                                    {money(sale.invest)}
                                </td>
                                <td class="py-2 pr-3 text-right font-mono" data-numeric>
                                    {netText(sale)}
                                </td>
                                <td class="py-2">
                                    <StatusChip status={sale.status} />
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                {/each}
            {/if}

            <tfoot>
                <tr class="border-t border-line-strong">
                    <td colspan="7" class="py-3">
                        <div class="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
                            <span class="text-ink-muted">
                                Tickets
                                <span class="font-mono text-ink" data-numeric>{summary.tickets}</span>
                            </span>
                            <span class="text-ink-muted">
                                Proceeds (SOLD)
                                <span class="font-mono text-ink" data-numeric
                                    >{money(summary.proceedsSold)}</span
                                >
                            </span>
                            <span class="text-ink-muted">
                                Invest (SOLD)
                                <span class="font-mono text-ink" data-numeric
                                    >{money(summary.investSold)}</span
                                >
                            </span>
                            <span class="font-medium text-ink">
                                Net before season pass
                                <span class="font-mono {summaryTone(summary.netSold)}" data-numeric
                                    >{signedMoney(summary.netSold)}</span
                                >
                            </span>
                        </div>
                    </td>
                </tr>
            </tfoot>
        </table>
    </div>
</section>
