<script lang="ts">
    import type { SeasonPass } from '$lib/types';
    
    type Props = {
        passes: SeasonPass[];
        currentYear: number;
        selectedPassIds: string[];
        onToggle: (id: string) => void;
    };

    const { passes, currentYear, selectedPassIds, onToggle }: Props = $props();

    const passesByYear = $derived.by(() => {
        const grouped = new Map<number, SeasonPass[]>();

        for (const pass of passes) {
            const bucket = grouped.get(pass.seasonStartYear) ?? [];

            bucket.push(pass);
            grouped.set(pass.seasonStartYear, bucket);
        }

        return [...grouped.entries()].sort(
            ([leftYear], [rightYear]) => rightYear - leftYear,
        );
    });

    const currentGroup = $derived(
        passesByYear.find(([year]) => year === currentYear),
    );
    const previousGroups = $derived(
        passesByYear.filter(([year]) => year !== currentYear),
    );
</script>

{#snippet passRow(pass: SeasonPass)}
    <label
        class="flex min-h-11 cursor-pointer items-center gap-3 rounded border px-3 py-2 text-sm transition-colors hover:bg-surface-strong {selectedPassIds.includes(
            pass.id,
        )
            ? 'border-line-strong bg-surface-strong'
            : 'border-line'}"
    >
        <input
            type="checkbox"
            class="size-4 accent-brand"
            checked={selectedPassIds.includes(pass.id)}
            onchange={(): void => onToggle(pass.id)}
        />
        <span class="flex min-w-0 flex-col">
            <span class="truncate font-medium">{pass.label}</span>
            <span class="text-xs text-ink-muted">
                {pass.category}, row {pass.row}, seat {pass.seat}
            </span>
        </span>
    </label>
{/snippet}

{#if passesByYear.length === 0}
    <p class="text-sm">
        No season passes yet.
        <a href="/season" class="underline">Create one first</a>.
    </p>
{:else}
    <div class="flex flex-col gap-3">
        {#if currentGroup != null}
            {@const [year, group] = currentGroup}
            <fieldset class="flex flex-col gap-2">
                <legend class="mb-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
                    Current season · {year}
                </legend>
                {#each group as pass (pass.id)}
                    {@render passRow(pass)}
                {/each}
            </fieldset>
        {/if}

        {#if previousGroups.length > 0}
            <details class="rounded border border-line px-3 py-2">
                <summary class="min-h-9 cursor-pointer text-sm leading-9">
                    Previous seasons
                </summary>
                <div class="mt-2 flex flex-col gap-3">
                    {#each previousGroups as [year, group] (year)}
                        <fieldset class="flex flex-col gap-2">
                            <legend class="mb-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
                                Season {year}
                            </legend>
                            {#each group as pass (pass.id)}
                                {@render passRow(pass)}
                            {/each}
                        </fieldset>
                    {/each}
                </div>
            </details>
        {/if}
    </div>
{/if}
