<script lang="ts">
    let {
        size = '1em',
        class: extra = '',
    }: { size?: string; class?: string } = $props();
</script>

<span
    aria-label="Loading"
    role="status"
    class="inline-block align-[-0.125em] {extra}"
    style="width: {size}; height: {size};"
>
    <svg
        class="animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
    >
        <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="3"
            stroke-opacity="0.25"
        />
        <path
            d="M22 12a10 10 0 0 1-10 10"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
        />
    </svg>
</span>
