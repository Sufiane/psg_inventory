import { Test } from '@nestjs/testing';

// No vi.mock('./observe') here: Vitest loads the pure-ESM @nestjs/observe
// natively — vitest.config.ts has no transformIgnorePatterns, so node_modules
// is never transformed (PSG-8). This spec therefore exercises the real wrapper.

const STUB_ENV = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/psg_inventory_smoke',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_SECRET: 'smoke-secret',
    JWT_EXPIRES: '1d',
    FOOTBALL_DATA_API_KEY: 'smoke-key',
};

describe('AppModule', () => {
    describe('when the whole application graph is compiled', () => {
        const savedEnv = { ...process.env };

        beforeAll(() => {
            Object.assign(process.env, STUB_ENV);
            delete process.env.OBSERVE_APP_KEY;
            delete process.env.OBSERVE_APP_SECRET;
        });

        afterAll(() => {
            process.env = savedEnv;
        });

        it('resolves every provider', async () => {
            // Imported inside the test, not at the top of the file:
            // ConfigModule.forRoot validates and AppModule's ObserveModule
            // ternary is evaluated the moment app.module.ts is first
            // evaluated, so the stub env has to already be in place.
            const { AppModule } = await import('./app.module');

            await expect(
                Test.createTestingModule({ imports: [AppModule] }).compile(),
            ).resolves.toBeDefined();
        }, 30_000);
    });
});
