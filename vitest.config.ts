import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SwcPlugin from 'unplugin-swc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [SwcPlugin.vite()],
    resolve: {
        alias: {
            '@psg/shared': path.resolve(__dirname, 'shared/src'),
            '.prisma/client': path.resolve(__dirname, 'node_modules/.prisma/client'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts'],
        setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
        coverage: {
            provider: 'v8',
            include: ['**/*.(t|j)s'],
            reportsDirectory: '../coverage',
        },
    },
});
