<script lang="ts">
    import { statusPill } from '$lib/sale-helpers';
    import type { SaleStatus } from '$lib/types';

    let { status }: { status: SaleStatus } = $props();
</script>

<span
    class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide {statusPill(
        status,
    )}"
>
    {status}
</span>
