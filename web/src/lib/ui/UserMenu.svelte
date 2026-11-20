<script lang="ts">
    import { afterNavigate } from '$app/navigation';
    import { initialsFromEmail } from '$lib/user';

    let { email }: { email: string } = $props();

    let menu = $state<HTMLDetailsElement>();
    let summary = $state<HTMLElement>();

    function close(): void {
        if (menu) {
            menu.open = false;
        }
    }

    function onWindowKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape' && menu?.open) {
            close();
            summary?.focus();
        }
    }

    function onWindowClick(event: MouseEvent): void {
        if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
            close();
        }
    }

    function onFocusout(event: FocusEvent): void {
        if (
            menu?.open &&
            event.relatedTarget instanceof Node &&
            !menu.contains(event.relatedTarget)
        ) {
            close();
        }
    }

    afterNavigate(close);
</script>

<svelte:window onkeydown={onWindowKeydown} onclick={onWindowClick} />

<details bind:this={menu} class="relative" onfocusout={onFocusout}>
    <summary
        bind:this={summary}
        aria-label="Account menu"
        class="flex size-11 sm:size-9 cursor-pointer list-none items-center justify-center rounded-full bg-surface-strong text-xs font-semibold text-ink select-none [&::-webkit-details-marker]:hidden"
    >
        {initialsFromEmail(email)}
    </summary>

    <div
        class="absolute right-0 z-20 mt-2 w-60 rounded-lg border border-line-strong bg-surface p-3 text-sm shadow-lg"
    >
        <p class="truncate text-ink-muted" title={email}>{email}</p>

        <form method="POST" action="/logout" class="mt-2 border-t border-line pt-2">
            <button
                type="submit"
                class="min-h-11 w-full rounded px-2 text-left font-medium text-primary hover:bg-surface-strong hover:text-primary-hover"
            >
                Sign out
            </button>
        </form>
    </div>
</details>
