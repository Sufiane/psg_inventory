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
    class="skeleton inline-block {rounded} {extra}"
    style="width: {width}; height: {height};"
></span>
