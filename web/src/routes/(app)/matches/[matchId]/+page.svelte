<script lang="ts">
    import type { PageData } from './$types';
    import MatchInspector from '$lib/ui/MatchInspector.svelte';

    let { data }: { data: PageData } = $props();
</script>

<a
    href="/matches"
    class="text-sm text-primary font-medium hover:text-primary-hover hover:underline"
    >&larr; Matches</a
>

<div class="mt-3 max-w-2xl">
    <MatchInspector match={data.match} sales={data.sales} headingLevel="h1" />
</div>
