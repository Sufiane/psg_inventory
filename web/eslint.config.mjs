import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

export default [
    { ignores: ['.svelte-kit/**', 'build/**', '.wrangler/**', 'node_modules/**'] },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    ...svelte.configs['flat/recommended'],
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
    },
    {
        files: ['**/*.svelte', '**/*.svelte.ts'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: {
                parser: tseslint.parser,
                extraFileExtensions: ['.svelte'],
            },
        },
    },
    {
        rules: {
            'no-console': 'error',
            'prefer-const': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { varsIgnorePattern: '^_$', argsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/explicit-function-return-type': [
                'error',
                { allowTypedFunctionExpressions: true },
            ],
            // Deployed at the site root, no kit.paths.base; resolve() adds nothing.
            'svelte/no-navigation-without-resolve': 'off',
            // Map and URLSearchParams are used as local scratch values, never reactively.
            'svelte/prefer-svelte-reactivity': 'off',
        },
    },
    {
        files: ['scripts/**/*.mjs'],
        rules: { 'no-console': 'off', '@typescript-eslint/explicit-function-return-type': 'off' },
    },
    {
        files: ['**/*.svelte', '**/*.svelte.ts'],
        rules: { 'prefer-const': 'off', 'svelte/prefer-const': 'error' },
    },
];
