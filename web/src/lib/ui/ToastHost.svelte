<script lang="ts">
    import { toastStore } from '$lib/stores/toast.svelte';

    const variantClass: Record<string, string> = {
        positive: 'border-positive bg-positive/10 text-positive-strong',
        warning: 'border-warning bg-warning/10 text-warning-strong',
        negative: 'border-negative bg-negative/5 text-negative-strong',
    };
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
    {#each toastStore.toasts as toast (toast.id)}
        <div
            role={toast.variant === 'negative' ? 'alert' : 'status'}
            class="rounded-lg border {variantClass[toast.variant]} text-sm px-3 py-2 shadow-lg flex items-start gap-2"
        >
            <span class="flex-1">{toast.message}</span>
            <button
                type="button"
                onclick={() => toastStore.dismiss(toast.id)}
                class="opacity-60 hover:opacity-100"
                aria-label="Dismiss"
            >
                ✕
            </button>
        </div>
    {/each}
</div>
