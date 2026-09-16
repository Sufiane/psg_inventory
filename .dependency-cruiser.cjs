/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'no-orm-outside-db',
            comment:
                'Prisma may only be imported by the db layer: anything under src/db/, or any *.db.ts file wherever it lives (so a colocated *.usecase.db.ts under src/api/ stays legal). Api services and controllers go through a db token.',
            severity: 'error',
            from: {
                pathNot: ['^src/db/', '\\.db\\.ts$', '\\.spec\\.ts$'],
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
            to: { path: ['^src/db/', '\\.db\\.ts$'] },
        },
        {
            name: 'no-prisma-service-outside-db',
            comment:
                "PrismaService is the db layer's own handle on the ORM. Api services, controllers and their modules reach the database through a db token, never by importing PrismaService.",
            severity: 'error',
            from: { pathNot: ['^src/db/', '\\.db\\.ts$'] },
            to: { path: '^src/db/prisma\\.service\\.ts$' },
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
