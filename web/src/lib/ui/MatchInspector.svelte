<script lang="ts">
    import { competitionLabel, dateTime, money } from '$lib/format';
    import { displayScore, matchOutcome, OUTCOME_CLASS } from '$lib/matches-view';
    import { saleNet } from '$lib/sale-math';
    import type { FormattedMatch, SaleListItem } from '$lib/types';
    import Button from './Button.svelte';
    import MathBlock from './MathBlock.svelte';
    import StatusChip from './StatusChip.svelte';

    type InspectorSale = Pick<
        SaleListItem,
        'id' | 'nbTickets' | 'status' | 'listedPrice' | 'profit' | 'invest' | 'Gift'
    >;

    type Props = {
        match: FormattedMatch;
        sales: InspectorSale[];
        headingLevel?: 'h1' | 'h2';
    };

    let { match, sales, headingLevel = 'h2' }: Props = $props();

    const score = $derived(displayScore(match));
    const outcome = $derived(matchOutcome(match));
</script>

<section aria-labelledby="inspector-title-{match.id}" class="rounded-lg border border-line bg-surface">
    <header class="border-b border-line p-5">
        <svelte:element
            this={headingLevel}
            id="inspector-title-{match.id}"
            class="text-xl font-semibold tracking-tight text-ink"
        >
            PSG {match.atHome ? 'vs' : '@'}
            {match.opponent}
        </svelte:element>

        <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt class="text-ink-muted">Date</dt>
            <dd class="text-ink" data-numeric>{dateTime(match.date)}</dd>
            <dt class="text-ink-muted">Competition</dt>
            <dd class="text-ink">{competitionLabel(match.competition)}</dd>
            <dt class="text-ink-muted">Venue</dt>
            <dd class="text-ink">{match.atHome ? 'Home' : 'Away'}</dd>
            {#if score && outcome}
                <dt class="text-ink-muted">Score</dt>
                <dd
                    class="font-mono {OUTCOME_CLASS[outcome]}"
                    data-numeric
                >
                    {score}
                    <span class="font-sans text-ink-muted">({outcome})</span>
                </dd>
            {/if}
        </dl>
    </header>

    <div class="p-5">
        <h3 class="text-sm font-semibold text-ink">Sales attached</h3>

        {#if sales.length === 0}
            <p class="mt-2 text-sm text-ink-faint">No sales recorded for this match.</p>
        {:else}
            <ul class="mt-3 space-y-3">
                {#each sales as sale (sale.id)}
                    <li class="rounded border border-line bg-surface-subtle p-4">
                        <div class="flex items-center justify-between gap-3">
                            <span class="text-sm text-ink" data-numeric>
                                {sale.nbTickets}
                                {sale.nbTickets === 1 ? 'ticket' : 'tickets'}
                            </span>
                            <StatusChip status={sale.status} />
                        </div>

                        {#if sale.status === 'GIFTED' && sale.Gift}
                            <p class="mt-2 text-sm text-gift-strong">
                                Gifted to {sale.Gift.Recipient.name}
                            </p>
                        {/if}

                        <div class="mt-3 flex items-baseline justify-between gap-4 text-sm">
                            <span class="text-ink-muted">Listed price</span>
                            <span class="font-mono text-ink" data-numeric
                                >{money(sale.listedPrice)}</span
                            >
                        </div>

                        {#if sale.status === 'SOLD'}
                            <MathBlock
                                lines={[
                                    { label: 'Proceeds', value: sale.profit },
                                    { label: 'Ticket invest', value: sale.invest, sign: 'minus' },
                                ]}
                                resultLabel="Net"
                                result={saleNet(sale)}
                            />
                        {:else}
                            <div class="flex items-baseline justify-between gap-4 py-1 text-sm">
                                <span class="text-ink-muted">Ticket invest</span>
                                <span class="font-mono text-ink" data-numeric
                                    >{money(sale.invest)}</span
                                >
                            </div>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}

        <div class="mt-5">
            <Button href="/sales/new?matchId={match.id}">Log sale</Button>
        </div>
    </div>
</section>
