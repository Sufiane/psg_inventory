import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Server-side unit tests only (+page.server.ts actions/helpers, $lib
// utilities). The sveltekit() plugin is what resolves `$lib`, `$app`,
// `$env/dynamic/*` and the `@psg/shared/*` alias the same way `vite dev` /
// `vite build` do, so route files can be imported unmodified.
export default defineConfig({
    plugins: [sveltekit()],
    test: {
        environment: 'node',
        include: ['src/**/*.spec.ts'],
    },
});
