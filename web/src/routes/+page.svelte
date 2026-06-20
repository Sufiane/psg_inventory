<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import Button from '$lib/ui/Button.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    let submittingKey = $state<string | null>(null);

    const demoMeta: Record<string, { label: string; summary: string }> = {
        demo1: {
            label: 'Two seasons',
            summary:
                '1 pass on the current season (2025), 1 pass on the previous (2024), sales on each.',
        },
        demo2: {
            label: 'Split passes',
            summary:
                '2 passes on the current season (2025). Each sale is split across both.',
        },
    };

    const tourStops = [
        ['Dashboard', 'Net realized profit, plus pending and unrealized cash.'],
        ['Matches', 'Fixtures grouped by season. Sales attach to a match.'],
        ['Sales', 'Log a sale. Mark sold, cancelled, or pending.'],
        ['Season', 'Record the lump-sum season pass cost. Amortized per match.'],
        ['Accounting', 'Per-season totals: realized, pending, unrealized.'],
    ] as const;
</script>

<svelte:head>
    <title>PSG Inventory — Ledger for season-ticket resellers</title>
    <meta
        name="description"
        content="A precise personal-finance ledger for ticket resellers. Sales tied to matches, matches grouped by seasons, season pass amortized."
    />
    <meta property="og:title" content="PSG Inventory" />
    <meta
        property="og:description"
        content="Personal ledger for season-ticket resellers. One trustworthy answer to 'am I making money?'"
    />
</svelte:head>

<div class="max-w-2xl mx-auto">
    <header
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-2 pb-12"
    >
        <span class="font-semibold tracking-tight text-ink">PSG Inventory</span>
        <nav class="flex items-center gap-3 sm:gap-5 text-sm" aria-label="Account">
            <a
                href="/login"
                class="inline-flex items-center min-h-11 text-ink-muted hover:text-ink px-2 transition-colors"
            >
                Sign in
            </a>
            <Button href="/register">Create account</Button>
        </nav>
    </header>

    <section class="mb-10">
        <h1
            class="text-3xl sm:text-4xl font-semibold tracking-tight text-ink leading-[1.15] text-balance"
        >
            A precise personal-finance ledger
            <span class="text-ink-muted">for season-ticket resellers.</span>
        </h1>
        <p class="mt-5 text-ink-muted text-lg leading-relaxed">
            Sales attach to matches. Matches group by season. The season pass is a
            lump-sum cost, amortized across the schedule. One trustworthy answer to
            <span class="text-ink">am I actually making money?</span>
        </p>
    </section>

    <section
        class="bg-surface rounded-lg border border-line p-5 sm:p-6 mb-12"
        aria-labelledby="demo-heading"
    >
        <div class="flex items-baseline justify-between gap-4 mb-1">
            <h2 id="demo-heading" class="text-base font-semibold tracking-tight text-ink">
                Tour with a seeded account
            </h2>
            <span class="text-xs text-ink-faint">no signup required</span>
        </div>
        <p class="text-sm text-ink-muted mb-5 leading-relaxed">
            Two demo accounts are pre-loaded with seasons, matches, sales, and season
            passes. Pick one to land on a populated dashboard. Changes you make stay on
            the demo account.
        </p>

        {#if form?.message}
            <p
                role="alert"
                class="mb-4 rounded border border-negative bg-negative/5 text-negative-strong text-sm px-3 py-2"
            >
                {form.message}
            </p>
        {/if}

        <ul class="divide-y divide-line">
            {#each Object.entries(data.demoAccounts) as [key, account] (key)}
                {@const meta = demoMeta[key] ?? { label: key, summary: '' }}
                <li class="py-4 first:pt-0 last:pb-0">
                    <div
                        class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5"
                    >
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium text-ink">{meta.label}</p>
                            <p
                                class="mt-0.5 font-mono text-xs text-ink-muted"
                                data-numeric
                            >
                                {account.email}
                                <span class="text-ink-faint"> · </span>
                                {account.password}
                            </p>
                            <p class="mt-1 text-xs text-ink-faint leading-snug">
                                {meta.summary}
                            </p>
                        </div>

                        <form
                            method="POST"
                            action="?/demo"
                            class="shrink-0"
                            use:enhance={() => {
                                submittingKey = key;

                                return async ({ update }) => {
                                    await update();
                                    submittingKey = null;
                                };
                            }}
                        >
                            <input type="hidden" name="account" value={key} />
                            <Button
                                type="submit"
                                disabled={submittingKey !== null && submittingKey !== key}
                                loading={submittingKey === key}
                                fullWidth
                                class="sm:w-auto"
                            >
                                Tour {meta.label.toLowerCase()}
                            </Button>
                        </form>
                    </div>
                </li>
            {/each}
        </ul>
    </section>

    <section class="mb-12" aria-labelledby="tour-heading">
        <h2
            id="tour-heading"
            class="text-sm font-medium text-ink-muted mb-3"
        >
            What you'll see inside
        </h2>
        <dl class="text-sm">
            {#each tourStops as [label, body] (label)}
                <div
                    class="py-1.5 grid grid-cols-[auto_1fr] gap-x-4 items-baseline"
                >
                    <dt class="text-ink font-medium">{label}</dt>
                    <dd class="text-ink-muted">{body}</dd>
                </div>
            {/each}
        </dl>
    </section>

    <footer
        class="border-t border-line py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-faint"
    >
        <span>Personal ledger. Not affiliated with the club.</span>
        <span class="flex items-center gap-4">
            <a href="/login" class="hover:text-ink transition-colors">Sign in</a>
            <a
                href="/register"
                class="text-primary font-medium hover:text-primary-hover hover:underline"
            >
                Create account
            </a>
        </span>
    </footer>
</div>
