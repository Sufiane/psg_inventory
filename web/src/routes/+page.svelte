<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import { enhance } from '$app/forms';
    import Button from '$lib/ui/Button.svelte';
    import { signedMoney } from '$lib/format';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    let submittingKey = $state<'demo1' | 'demo2' | null>(null);

    const demoOutage = $derived.by(() => {
        if (data.demoStatus.kind === 'backend-down') {
            return "Backend is unreachable, so the demo accounts can't sign in right now. Try again shortly or create an account.";
        }

        if (data.demoStatus.kind === 'db-down') {
            return "The database is offline, so the demo accounts can't sign in right now. Try again shortly or create an account.";
        }

        return null;
    });

    const tourStops = [
        ['Dashboard', 'Net realized profit, plus pending and unrealized cash.'],
        ['Matches', 'Fixtures grouped by season. Sales attach to a match.'],
        ['Sales', 'Log a sale. Mark sold, cancelled, or pending.'],
        ['Season', 'Record the lump-sum season pass cost. Amortized per match.'],
        ['Accounting', 'Per-season totals: realized, pending, unrealized.'],
    ] as const;

    function netToneClass(value: number): string {
        if (value < 0) {
            return 'text-negative-strong';
        }

        if (value > 0) {
            return 'text-positive-strong';
        }

        return 'text-ink';
    }
</script>

<svelte:head>
    <title>PSG Inventory: ledger for season-ticket resellers</title>
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

<section class="hero">
    <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <header
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6"
        >
            <a
                href="/"
                class="font-semibold tracking-tight text-hero-ink hover:opacity-80 transition-opacity"
            >
                PSG Inventory
            </a>
            <nav
                class="flex items-center gap-2 sm:gap-4 text-sm"
                aria-label="Account"
            >
                <a
                    href="/login"
                    class="inline-flex items-center min-h-11 text-hero-ink-muted hover:text-hero-ink px-2 transition-colors"
                >
                    Sign in
                </a>
                <a
                    href="/register"
                    class="inline-flex items-center min-h-11 rounded border border-hero-ink/30 text-hero-ink px-3.5 hover:bg-hero-ink/10 transition-colors"
                >
                    Create account
                </a>
            </nav>
        </header>

        <div class="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 pt-12 pb-20 lg:pt-20 lg:pb-28 items-center">
            <div>
                <p
                    class="text-sm font-medium text-hero-ink-muted mb-4 inline-flex items-center gap-2"
                >
                    <span
                        aria-hidden="true"
                        class="inline-block w-1.5 h-1.5 rounded-full bg-hero-ink-muted/80"
                    ></span>
                    Personal ledger for season-ticket resellers
                </p>
                <h1
                    class="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] text-hero-ink text-balance"
                >
                    Know exactly how much
                    <span class="text-hero-ink-muted">
                        you're making this season.
                    </span>
                </h1>
                <p
                    class="mt-6 text-lg leading-relaxed text-hero-ink-muted max-w-xl text-pretty"
                >
                    Sales attach to matches. Matches group by season. The season pass is
                    a lump-sum cost, amortized across the schedule. One trustworthy
                    answer to <span class="text-hero-ink">am I actually making money?</span>
                </p>

                {#if demoOutage}
                    <p
                        role="status"
                        class="mt-6 rounded border border-hero-ink/30 bg-hero-bg-deep/50 text-hero-ink text-sm px-3 py-2 max-w-xl"
                    >
                        {demoOutage}
                    </p>
                {:else if form?.message}
                    <p
                        role="alert"
                        class="mt-6 rounded border border-hero-ink/30 bg-hero-bg-deep/50 text-hero-ink text-sm px-3 py-2 max-w-xl"
                    >
                        {form.message}
                    </p>
                {/if}

                <div class="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
                    <form
                        method="POST"
                        action="?/demo"
                        use:enhance={() => {
                            submittingKey = 'demo1';

                            return async ({ update }) => {
                                await update();
                                submittingKey = null;
                            };
                        }}
                    >
                        <input type="hidden" name="account" value="demo1" />
                        <button
                            type="submit"
                            disabled={demoOutage !== null ||
                                (submittingKey !== null && submittingKey !== 'demo1')}
                            aria-busy={submittingKey === 'demo1' || undefined}
                            class="hero-primary inline-flex items-center justify-center gap-2 min-h-12 rounded bg-hero-ink text-hero-bg px-5 py-3 text-base font-medium hover:bg-hero-ink-muted disabled:opacity-60 disabled:cursor-not-allowed transition-colors w-full sm:w-auto"
                        >
                            {#if submittingKey === 'demo1'}
                                <span
                                    aria-hidden="true"
                                    class="inline-block w-4 h-4 rounded-full border-2 border-hero-bg/30 border-t-hero-bg animate-spin"
                                ></span>
                            {/if}
                            Tour the live demo
                            <span aria-hidden="true" class="hero-primary-arrow">→</span>
                        </button>
                    </form>

                    <span class="text-sm text-hero-ink-muted">
                        Real data. No signup.
                    </span>
                </div>

                <div class="mt-5 text-sm text-hero-ink-muted flex flex-wrap items-baseline gap-x-1.5">
                    <span>Tracking multiple passes?</span>
                    <form
                        method="POST"
                        action="?/demo"
                        use:enhance={() => {
                            submittingKey = 'demo2';

                            return async ({ update }) => {
                                await update();
                                submittingKey = null;
                            };
                        }}
                    >
                        <input type="hidden" name="account" value="demo2" />
                        <button
                            type="submit"
                            disabled={demoOutage !== null ||
                                (submittingKey !== null && submittingKey !== 'demo2')}
                            aria-busy={submittingKey === 'demo2' || undefined}
                            class="text-hero-ink underline-offset-4 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {#if submittingKey === 'demo2'}
                                Signing in…
                            {:else}
                                Tour the split-pass demo →
                            {/if}
                        </button>
                    </form>
                </div>
            </div>

            <div aria-hidden={data.showcase === null}>
                {#if data.showcase}
                    {@const showcase = data.showcase}
                    <div
                        class="preview-card relative bg-surface text-ink rounded-xl border border-hero-ink/10 shadow-2xl shadow-hero-bg-deep/40 p-6 sm:p-7"
                    >
                        <div
                            class="flex items-center justify-between gap-3 pb-4 border-b border-line"
                        >
                            <div class="flex items-center gap-2 text-xs text-ink-muted">
                                <span
                                    aria-hidden="true"
                                    class="inline-block w-2 h-2 rounded-full bg-positive-strong"
                                ></span>
                                Live demo · season {showcase.seasonStartYear ?? '—'}
                            </div>
                            <span
                                class="text-xs text-ink-faint font-mono"
                                data-numeric
                            >
                                {showcase.soldCount} sold
                            </span>
                        </div>

                        <p class="mt-5 text-xs font-medium text-ink-muted">
                            Net realized profit
                        </p>
                        <p
                            class="mt-1 font-mono text-4xl sm:text-5xl font-semibold tracking-tight {netToneClass(
                                showcase.netProfit,
                            )}"
                            data-numeric
                        >
                            {signedMoney(showcase.netProfit)}
                        </p>

                        <dl
                            class="mt-6 grid grid-cols-2 gap-x-5 gap-y-2 text-sm"
                            data-numeric
                        >
                            <dt class="text-ink-muted">Realized proceeds</dt>
                            <dd
                                class="text-right font-mono {showcase.realizedProceeds >=
                                0
                                    ? 'text-positive'
                                    : 'text-negative'}"
                            >
                                {signedMoney(showcase.realizedProceeds)}
                            </dd>

                            <dt class="text-ink-muted">Ticket invest</dt>
                            <dd class="text-right font-mono text-ink-muted">
                                {signedMoney(-showcase.realizedInvest)}
                            </dd>

                            <dt class="text-ink-muted">Season investment</dt>
                            <dd class="text-right font-mono text-ink-muted">
                                {signedMoney(-showcase.seasonInvest)}
                            </dd>
                        </dl>

                        <p class="mt-5 pt-4 border-t border-line text-xs text-ink-faint">
                            This is the actual dashboard the demo account sees. Numbers
                            recompute as you log sales.
                        </p>

                        <span
                            aria-hidden="true"
                            class="preview-badge absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-hero-bg-deep text-hero-ink text-xs font-medium px-2.5 py-1 border border-hero-ink/20"
                        >
                            <span
                                class="inline-block w-1.5 h-1.5 rounded-full bg-positive-strong"
                            ></span>
                            Live preview
                        </span>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</section>

<section class="bg-surface text-ink">
    <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div class="grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16 items-start">
            <div>
                <h2
                    class="text-2xl sm:text-3xl font-semibold tracking-tight text-ink text-balance"
                >
                    The five screens that run the season.
                </h2>
                <p class="mt-4 text-ink-muted text-pretty">
                    Enter sales as you make them. Read the dashboard for the bottom
                    line. Audit any number back to the match and the season pass it
                    came from.
                </p>
                <Button href="/register" class="mt-6">Create your own account</Button>
            </div>

            <dl class="text-sm divide-y divide-line border-t border-b border-line">
                {#each tourStops as [label, body] (label)}
                    <div
                        class="py-3 grid grid-cols-[7rem_1fr] sm:grid-cols-[9rem_1fr] gap-x-4 items-baseline"
                    >
                        <dt class="text-ink font-medium">{label}</dt>
                        <dd class="text-ink-muted text-pretty">{body}</dd>
                    </div>
                {/each}
            </dl>
        </div>
    </div>
</section>

<footer class="bg-surface text-ink-faint border-t border-line">
    <div
        class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 flex flex-wrap items-center justify-between gap-3 text-xs"
    >
        <span>Personal ledger. Not affiliated with the club.</span>
        <span class="flex items-center gap-5">
            <a href="/login" class="hover:text-ink transition-colors">Sign in</a>
            <a
                href="/register"
                class="text-primary font-medium hover:text-primary-hover hover:underline"
            >
                Create account
            </a>
        </span>
    </div>
</footer>

<style>
    .hero {
        background: var(--color-hero-bg);
        color: var(--color-hero-ink);
        position: relative;
        overflow: hidden;
    }

    /* Soft chroma bloom in the top-right so the drench isn't a flat panel.
       Sits behind content via pointer-events:none. */
    .hero::before {
        content: '';
        position: absolute;
        inset: -20% -10% auto auto;
        width: 60rem;
        height: 60rem;
        background: radial-gradient(
            circle at center,
            color-mix(in oklch, var(--color-hero-ink) 10%, transparent) 0%,
            transparent 60%
        );
        pointer-events: none;
        opacity: 0.55;
    }

    .hero-primary-arrow {
        display: inline-block;
        transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .hero-primary:hover .hero-primary-arrow {
        transform: translateX(2px);
    }

    @media (prefers-reduced-motion: reduce) {
        .hero-primary-arrow {
            transition: none;
        }
    }
</style>
