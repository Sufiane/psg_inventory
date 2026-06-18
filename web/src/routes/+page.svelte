<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import Spinner from '$lib/ui/Spinner.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    let submittingKey = $state<string | null>(null);

    const principles = [
        {
            n: '01',
            title: 'Data is the product.',
            body: 'No marketing chrome. Sales, matches, season passes — every number sourced and reproducible.',
        },
        {
            n: '02',
            title: 'Precision earns trust.',
            body: 'Net = proceeds − ticket invest − season pass. Shown line by line, not collapsed into a single hero stat.',
        },
        {
            n: '03',
            title: 'Honest about state.',
            body: 'Pending, unrealized, future seasons, missing data — named, not papered over with zeros.',
        },
    ];

    const tourStops = [
        {
            label: 'Dashboard',
            body: 'Net realized profit for the current season, plus pending and unrealized cash, in three glances.',
        },
        {
            label: 'Matches',
            body: 'Fixtures grouped by season. Drill into a match to see sales allocated to that night.',
        },
        {
            label: 'Sales',
            body: 'Log a sale in seconds. Mark sold, cancelled, or pending — status changes flow through accounting.',
        },
        {
            label: 'Season',
            body: 'Record the lump-sum season pass cost. Amortized across the season so per-match math stays honest.',
        },
        {
            label: 'Accounting',
            body: 'Per-season totals across realized, pending, and unrealized. The defensible end-of-season number.',
        },
    ];
</script>

<svelte:head>
    <title>PSG Inventory — Ledger for season-ticket resellers</title>
    <meta
        name="description"
        content="A precise personal-finance ledger for ticket resellers. Sales tied to matches, matches grouped by seasons, season pass amortized — so 'am I making money?' has one trustworthy answer."
    />
</svelte:head>

<div class="max-w-3xl mx-auto">
    <header class="flex items-center justify-between pt-2 pb-10">
        <span class="font-semibold tracking-tight text-ink">PSG Inventory</span>
        <a
            href="/login"
            class="text-sm text-primary font-medium hover:text-primary-hover hover:underline px-1 py-2"
        >
            Sign in
        </a>
    </header>

    <section class="mb-14">
        <p
            class="text-xs uppercase tracking-[0.18em] text-ink-faint mb-4"
            aria-hidden="true"
        >
            Ledger · v1
        </p>
        <h1
            class="text-3xl sm:text-4xl font-semibold tracking-tight text-ink leading-[1.15] text-balance"
        >
            A precise personal-finance ledger
            <span class="text-ink-muted">for season-ticket resellers.</span>
        </h1>
        <p class="mt-5 text-ink-muted text-base leading-relaxed max-w-2xl">
            Sales tied to matches. Matches grouped by seasons. The season pass treated
            as a lump-sum cost, amortized across the schedule. One trustworthy answer
            to <em class="not-italic text-ink">am I actually making money?</em> — no
            export to Excel.
        </p>
    </section>

    <section
        class="bg-surface rounded-lg border border-line p-5 sm:p-6 mb-12"
        aria-labelledby="demo-heading"
    >
        <div class="flex items-baseline justify-between gap-4 mb-4">
            <h2 id="demo-heading" class="text-base font-semibold tracking-tight text-ink">
                Tour with a seeded account
            </h2>
            <span class="text-xs text-ink-faint">read-write · ephemeral</span>
        </div>

        <p class="text-sm text-ink-muted mb-5 leading-relaxed">
            Two demo accounts are pre-loaded with seasons, matches, sales, and season
            passes. Sign in as either — you'll land on the dashboard with a populated
            ledger. Re-seeding wipes and rebuilds these two users only.
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
                {@const summary =
                    key === 'demo1'
                        ? '1 pass current season (2025), 1 pass previous (2024), sales on each.'
                        : '2 passes same current season (2025), each sale split across both.'}
                <li class="py-4 first:pt-0 last:pb-0">
                    <div
                        class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
                    >
                        <div class="min-w-0 flex-1">
                            <p
                                class="font-mono text-sm text-ink"
                                data-numeric
                            >
                                {account.email}
                                <span class="text-ink-faint"> · </span>
                                <span class="text-ink-muted">{account.password}</span>
                            </p>
                            <p class="mt-1 text-xs text-ink-muted leading-snug">
                                {summary}
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
                            <button
                                type="submit"
                                disabled={submittingKey !== null}
                                class="w-full sm:w-auto rounded bg-primary text-surface px-3 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors"
                            >
                                {#if submittingKey === key}
                                    <Spinner size="1em" />
                                {/if}
                                Sign in as {key}
                            </button>
                        </form>
                    </div>
                </li>
            {/each}
        </ul>

        <p class="mt-5 text-xs text-ink-faint">
            The session is a normal signed-in session — nothing is sandboxed. Sign out
            from the header when you're done.
        </p>
    </section>

    <section class="mb-12" aria-labelledby="tour-heading">
        <h2
            id="tour-heading"
            class="text-base font-semibold tracking-tight text-ink mb-4"
        >
            What you'll see inside
        </h2>
        <dl class="divide-y divide-line border-y border-line">
            {#each tourStops as stop (stop.label)}
                <div class="py-3 grid grid-cols-[8rem_1fr] gap-4 items-baseline">
                    <dt class="text-sm font-medium text-ink">{stop.label}</dt>
                    <dd class="text-sm text-ink-muted leading-relaxed">{stop.body}</dd>
                </div>
            {/each}
        </dl>
    </section>

    <section class="mb-16" aria-labelledby="principles-heading">
        <h2
            id="principles-heading"
            class="text-base font-semibold tracking-tight text-ink mb-4"
        >
            Design principles
        </h2>
        <ol class="grid sm:grid-cols-3 gap-4">
            {#each principles as principle (principle.n)}
                <li class="bg-surface rounded-lg border border-line p-4">
                    <p
                        class="font-mono text-xs text-ink-faint mb-2"
                        data-numeric
                    >
                        {principle.n}
                    </p>
                    <p class="text-sm font-medium text-ink mb-1">
                        {principle.title}
                    </p>
                    <p class="text-xs text-ink-muted leading-relaxed">
                        {principle.body}
                    </p>
                </li>
            {/each}
        </ol>
    </section>

    <footer
        class="border-t border-line py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-faint"
    >
        <span>PSG Inventory · personal ledger, not affiliated with the club.</span>
        <a
            href="/login"
            class="text-primary font-medium hover:text-primary-hover hover:underline"
        >
            Sign in →
        </a>
    </footer>
</div>
