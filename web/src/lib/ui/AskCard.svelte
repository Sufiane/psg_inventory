<script lang="ts">
    import { enhance } from '$app/forms';
    import { tick } from 'svelte';
    import Button from '$lib/ui/Button.svelte';
    import { money, signedMoney } from '$lib/format';
    import type { AskAnswer } from '$lib/types';

    let {
        answer = null,
        message = null,
        question = '',
    }: {
        answer?: AskAnswer | null;
        message?: string | null;
        question?: string;
    } = $props();

    let pending = $state(false);
    let value = $state(question);
    let formEl: HTMLFormElement | undefined;

    const EXAMPLES = [
        'How is the current season going?',
        'What is my all-time revenue?',
        'Have I broken even on my season pass?',
    ];

    // One click both fills the input and fires the request, so the chips
    // double as a working demo of the feature rather than just a hint.
    // Svelte 5 flushes `$state` -> DOM on a microtask, but requestSubmit()
    // is synchronous, so we await tick() first or enhance would serialize
    // the previous value instead of the example just clicked.
    async function askExample(example: string): Promise<void> {
        value = example;
        await tick();
        formEl?.requestSubmit();
    }

    function formatMoney(amount: number | null): string {
        if (amount === null) {
            return '—';
        }

        return money(amount);
    }

    function formatSignedMoney(amount: number | null): string {
        if (amount === null) {
            return '—';
        }

        return signedMoney(amount);
    }

    // Matches AccountingCard's moneyTone / dashboard's netTone convention:
    // realized profit is colored by its sign, with color blindness covered
    // by the explicit +/- from signedMoney above.
    function profitTone(amount: number | null): string {
        if (amount === null || amount === 0) {
            return 'text-ink';
        }

        return amount < 0 ? 'text-negative' : 'text-positive';
    }
</script>

<section class="rounded-lg border border-line bg-surface p-5">
    <h2 class="text-base font-semibold tracking-tight text-ink">Ask about your data</h2>
    <p class="mt-0.5 text-xs text-ink-faint">
        Figures below come straight from your ledger, not from the model.
    </p>

    <form
        bind:this={formEl}
        method="POST"
        action="?/ask"
        class="mt-4 flex gap-2"
        use:enhance={() => {
            pending = true;

            return async ({ update }) => {
                await update({ reset: false });
                pending = false;
            };
        }}
    >
        <label class="sr-only" for="ask-question">Question</label>
        <input
            id="ask-question"
            name="question"
            bind:value
            disabled={pending}
            placeholder="How is the current season going?"
            maxlength="500"
            autocomplete="off"
            class="min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink transition-colors disabled:opacity-60"
        />
        <Button type="submit" loading={pending}>Ask</Button>
    </form>

    <div class="mt-3 flex flex-wrap gap-2">
        {#each EXAMPLES as example (example)}
            <button
                type="button"
                disabled={pending}
                onclick={() => askExample(example)}
                class="rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
                {example}
            </button>
        {/each}
    </div>

    <div aria-live="polite">
        {#if message}
            <p role="alert" class="mt-3 text-sm text-negative-strong">{message}</p>
        {/if}

        {#if answer}
            <p class="mt-4 text-sm leading-relaxed text-ink">{answer.answer}</p>

            <!-- Rendered from the API's structured figures, not the prose above,
                 so the numbers on screen are always the database's. -->
            <dl
                class="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-3 lg:grid-cols-5"
            >
                <div>
                    <dt class="text-xs text-ink-muted">Season net profit</dt>
                    <dd
                        class="font-mono text-sm {profitTone(
                            answer.figures.currentSeasonProfit,
                        )}"
                    >
                        {formatSignedMoney(answer.figures.currentSeasonProfit)}
                    </dd>
                </div>
                <div>
                    <dt class="text-xs text-ink-muted">Season tickets</dt>
                    <dd class="font-mono text-sm text-ink" data-numeric>
                        {answer.figures.currentSeasonTickets ?? '—'}
                    </dd>
                </div>
                <div>
                    <dt class="text-xs text-ink-muted">All-time net profit</dt>
                    <dd
                        class="font-mono text-sm {profitTone(answer.figures.allTimeProfit)}"
                    >
                        {formatSignedMoney(answer.figures.allTimeProfit)}
                    </dd>
                </div>
                <div>
                    <dt class="text-xs text-ink-muted">Pending sales</dt>
                    <dd class="font-mono text-sm text-ink">
                        {formatMoney(answer.figures.pendingSales)}
                    </dd>
                </div>
                <div>
                    <dt class="text-xs text-ink-muted">Amortization</dt>
                    <dd
                        class="font-mono text-sm {answer.figures.brokeEven
                            ? 'text-positive'
                            : 'text-ink'}"
                    >
                        {#if answer.figures.brokeEven}
                            Broken even
                        {:else}
                            {formatMoney(answer.figures.amortizationRemaining)} left
                        {/if}
                    </dd>
                </div>
            </dl>
        {/if}
    </div>
</section>
