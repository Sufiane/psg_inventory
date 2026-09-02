// env.schema.ts's class-validator/class-transformer decorators need this
// polyfill loaded before the class is defined. Every other spec file gets
// it transitively via @nestjs/testing's Nest bootstrap; this is the only
// spec that imports env.schema.ts standalone, with no Nest module involved.
import 'reflect-metadata';

import { validate } from './env.schema';

const REQUIRED_ENV = {
    JWT_SECRET: 'secret',
    JWT_EXPIRES: '1d',
    FOOTBALL_DATA_API_KEY: 'football-key',
    REDIS_URL: 'redis://localhost:6379',
};

describe('validate', () => {
    describe('ASK_RATE_LIMIT_PER_HOUR', () => {
        describe('when it is unset', () => {
            it('boots without error', () => {
                expect(() => validate({ ...REQUIRED_ENV })).not.toThrow();
            });
        });

        describe('when it is a valid positive integer string', () => {
            it('boots without error', () => {
                expect(() =>
                    validate({ ...REQUIRED_ENV, ASK_RATE_LIMIT_PER_HOUR: '20' }),
                ).not.toThrow();
            });

            it('coerces it to a number', () => {
                const config = validate({
                    ...REQUIRED_ENV,
                    ASK_RATE_LIMIT_PER_HOUR: '20',
                });

                expect(config.ASK_RATE_LIMIT_PER_HOUR).toBe(20);
            });
        });

        describe('when it is an empty string', () => {
            it('fails boot instead of silently degrading', () => {
                expect(() =>
                    validate({ ...REQUIRED_ENV, ASK_RATE_LIMIT_PER_HOUR: '' }),
                ).toThrow();
            });
        });

        describe('when it is non-numeric garbage', () => {
            it('fails boot instead of silently degrading', () => {
                expect(() =>
                    validate({
                        ...REQUIRED_ENV,
                        ASK_RATE_LIMIT_PER_HOUR: 'not-a-number',
                    }),
                ).toThrow();
            });
        });

        describe('when it is zero', () => {
            it('fails boot instead of silently degrading', () => {
                expect(() =>
                    validate({ ...REQUIRED_ENV, ASK_RATE_LIMIT_PER_HOUR: '0' }),
                ).toThrow();
            });
        });

        describe('when it is negative', () => {
            it('fails boot instead of silently degrading', () => {
                expect(() =>
                    validate({ ...REQUIRED_ENV, ASK_RATE_LIMIT_PER_HOUR: '-5' }),
                ).toThrow();
            });
        });
    });
});
