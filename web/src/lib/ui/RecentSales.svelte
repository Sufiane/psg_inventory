<script lang="ts">
    import { page } from '$app/state';
    import { money, shortDate, signedMoney } from '$lib/format';
    import { carrySeason } from '$lib/season';
    import { profitTone } from '$lib/sale-helpers';
    import { saleNet } from '$lib/sale-math';
    import StatusChip from '$lib/ui/StatusChip.svelte';
    import type { SaleListItem } from '$lib/types';

    let { sales }: { sales: SaleListItem[] } = $props();

    const linkClass = 'text-primary font-medium hover:text-primary-hover hover:underline';
</script>

{#if sales.length === 0}
    <p class="text-sm text-ink-faint">
        No sales yet.
        <a href="/sales/new" class={linkClass}>Log your first sale</a>
    </p>
{:else}
    <ul class="divide-y divide-line">
        {#each sales as sale (sale.id)}
            {@const net = saleNet(sale)}
            <li>
                <a
                    href="/matches/{sale.matchId}"
                    class="flex items-center gap-3 py-3 text-sm hover:bg-surface-strong rounded-md px-2 -mx-2 transition-colors"
                >
                    <span class="flex-1 min-w-0">
                        <span class="block truncate font-medium text-ink">
                            {sale.opponent.name}
                        </span>
                        <span class="block text-xs text-ink-muted">
                            {#if sale.matchDate}
                                {shortDate(sale.matchDate)} ·
                            {/if}
                            {sale.nbTickets}
                            {sale.nbTickets === 1 ? 'ticket' : 'tickets'}
                        </span>
                    </span>

                    <StatusChip status={sale.status} />

                    <span class="w-28 shrink-0 text-right">
                        {#if sale.status === 'GIFTED'}
                            <span class="text-xs text-gift-strong">
                                Gifted to {sale.Gift?.Recipient.name ?? 'someone'}
                            </span>
                        {:else if sale.status !== 'CANCELLED'}
                            <span class="block font-mono text-ink-muted" data-numeric>
                                {money(sale.listedPrice)}
                            </span>
                            <span
                                class="block font-mono {profitTone(sale.status, net)}"
                                data-numeric
                            >
                                {signedMoney(net)}
                            </span>
                        {/if}
                    </span>
                </a>
            </li>
        {/each}
    </ul>

    <p class="mt-3 text-sm">
        <a href={carrySeason('/sales', page.url)} class={linkClass}>All sales</a>
    </p>
{/if}
