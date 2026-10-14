import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
    {
        files: ['**/*.{js,mjs,cjs,ts}'],
    },
    {
        files: ['**/*.js'], languageOptions: {
            sourceType: 'commonjs',
        },
    },
    {
        languageOptions: {
            globals: globals.node,
        },
    },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            'no-console': 'error',
            'prefer-const': 'error',
            '@typescript-eslint/explicit-function-return-type': [
                'error',
                { allowTypedFunctionExpressions: true },
            ],
        },
    },
    {
        files: ['src/**/*.ts', 'scripts/**/*.ts'],
        ignores: ['**/*.spec.ts'],
        plugins: { sonarjs },
        rules: {
            'sonarjs/cognitive-complexity': ['error', 27],
        },
    },
];
