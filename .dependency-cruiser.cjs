/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'no-orm-outside-db',
            comment:
                'Only *.db.ts files (the data-access layer) and prisma.service.ts may import Prisma. Services and controllers must go through a *.db.ts.',
            severity: 'error',
            from: {
                pathNot: ['^src/db/', '\\.spec\\.ts$'],
            },
            to: {
                path: ['^node_modules/(@prisma/client|\\.prisma/client)'],
                dependencyTypesNot: ['type-only'],
            },
        },
        {
            name: 'no-db-from-controller',
            comment:
                'Controllers are the http boundary; they must call api services, never the db layer directly.',
            severity: 'error',
            from: { path: '\\.controller\\.ts$' },
            to: { path: '^src/db/' },
        },
        {
            name: 'no-api-from-db',
            comment:
                'The db layer is a leaf — it must never import upward from src/api. Prevents tangling http concerns into data access.',
            severity: 'error',
            from: { path: '^src/db/' },
            to: { path: '^src/api/' },
        },
        {
            name: 'no-circular',
            comment: 'Circular dependencies are usually a sign of a missing abstraction.',
            severity: 'error',
            from: {},
            to: { circular: true },
        },
        {
            name: 'no-orphans',
            comment: 'Files that nothing imports are usually dead code.',
            severity: 'warn',
            from: {
                orphan: true,
                pathNot: [
                    '\\.d\\.ts$',
                    '\\.spec\\.ts$',
                    '(^|/)tsconfig\\.json$',
                    '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
                    '^src/main\\.ts$',
                ],
            },
            to: {},
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        tsConfig: { fileName: 'tsconfig.json' },
        tsPreCompilationDeps: true,
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default'],
        },
        reporterOptions: {
            text: { highlightFocused: true },
        },
    },
};
