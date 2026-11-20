<script lang="ts">
    import { page } from '$app/state';
    import { resolveSeason, retainedParams, seasonChoices, seasonScope } from '$lib/season';

    let scope = $derived(seasonScope(page.url.pathname));
    let allowAll = $derived(scope === 'season-or-all');
    let selected = $derived(resolveSeason(page.url, allowAll));
    let choices = $derived(
        seasonChoices(new Date(), 6, selected === 'all' ? null : selected),
    );
    let hidden = $derived(retainedParams(page.url));
</script>

{#if scope !== 'none'}
    <form method="GET" data-sveltekit-keepfocus class="flex items-center gap-2">
        {#each hidden as [name, value] (name)}
            <input type="hidden" {name} {value} />
        {/each}

        <label for="season-select" class="sr-only">Season</label>
        <select
            id="season-select"
            name="year"
            class="min-h-11 sm:min-h-9 rounded border border-line-strong bg-surface text-ink px-2 text-sm hover:border-ink transition-colors"
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
        >
            {#each choices as choice (choice.year)}
                <option value={choice.year} selected={selected === choice.year}>
                    {choice.label}
                </option>
            {/each}
            {#if allowAll}
                <option value="all" selected={selected === 'all'}>All seasons</option>
            {/if}
        </select>

        <noscript>
            <button type="submit" class="text-sm text-primary">Apply</button>
        </noscript>
    </form>
{/if}
