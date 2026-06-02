<script lang="ts">
    let {
        width = '100%',
        height = '1rem',
        rounded = 'rounded',
        class: extra = '',
    }: {
        width?: string;
        height?: string;
        rounded?: string;
        class?: string;
    } = $props();
</script>

<span
    aria-hidden="true"
    class="inline-block bg-slate-200 animate-pulse {rounded} {extra}"
    style="width: {width}; height: {height};"
></span>
