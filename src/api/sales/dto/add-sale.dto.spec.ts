import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AddSaleDto } from './add-sale.dto';
import { UpdateSaleDto } from './update-sale.dto';

const SEASON_PASS_ID = '3f8a1c52-9b0e-4d5a-8c11-2e7d6a4b9f10';

function buildPayload(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        matchId: 'match-1',
        saleId: 'sale-1',
        allocations: [{ seasonPassId: SEASON_PASS_ID, nbTickets: 1 }],
        listedPrice: 50,
        invest: 0,
        ...overrides,
    };
}

async function failedProperties(
    dtoClass: ClassConstructor<object>,
    payload: Record<string, unknown>,
): Promise<string[]> {
    const errors = await validate(plainToInstance(dtoClass, payload));

    return errors.map((error) => error.property);
}

describe.each([
    ['AddSaleDto', AddSaleDto],
    ['UpdateSaleDto', UpdateSaleDto],
])('%s whole-euro validation', (_name, dtoClass) => {
    describe('when listedPrice is a fraction', () => {
        it('rejects', async () => {
            const failed = await failedProperties(dtoClass, buildPayload({ listedPrice: 33.5 }));

            expect(failed).toContain('listedPrice');
        });
    });

    describe('when invest is a fraction', () => {
        it('rejects', async () => {
            const failed = await failedProperties(dtoClass, buildPayload({ invest: 2.5 }));

            expect(failed).toContain('invest');
        });
    });

    describe('when both are whole numbers', () => {
        it('accepts', async () => {
            const failed = await failedProperties(dtoClass, buildPayload({ listedPrice: 33, invest: 12 }));

            expect(failed).toEqual([]);
        });

        it('accepts invest 0', async () => {
            const failed = await failedProperties(dtoClass, buildPayload({ invest: 0 }));

            expect(failed).toEqual([]);
        });
    });

    describe('when listedPrice is 0', () => {
        it('rejects', async () => {
            const failed = await failedProperties(dtoClass, buildPayload({ listedPrice: 0 }));

            expect(failed).toContain('listedPrice');
        });
    });
});
