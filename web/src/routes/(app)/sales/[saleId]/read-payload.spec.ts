import { describe, expect, it } from 'vitest';
import { readPayload } from './read-payload';

/** Builds the FormData a real submit of this route's single form would
 * produce. */
function buildForm(fields: Record<string, string>): FormData {
    const form = new FormData();

    for (const [key, value] of Object.entries(fields)) {
        form.set(key, value);
    }

    return form;
}

describe('readPayload', () => {
    describe('when the status <select> resubmits the unchanged current status', () => {
        // The regression under test: SOLD-past-kickoff, correcting the price
        // used to be rejected with SALE_AFTER_KICKOFF because the <select>
        // always submits a value (PENDING/SOLD) even when the user never
        // touched it, and the backend guards any request that targets SOLD
        // past kickoff — regardless of whether status is actually changing.
        it('omits status from the payload', () => {
            const result = readPayload(
                buildForm({
                    status: 'SOLD',
                    currentStatus: 'SOLD',
                    listedPrice: '150',
                    invest: '90',
                }),
                'sale-1',
            );

            expect(result.error).toBeUndefined();
            expect(result.payload).toEqual({
                saleId: 'sale-1',
                listedPrice: 150,
                invest: 90,
            });
        });

        it('still forwards the other edited fields', () => {
            const result = readPayload(
                buildForm({
                    status: 'PENDING',
                    currentStatus: 'PENDING',
                    listedPrice: '75',
                }),
                'sale-1',
            );

            expect(result.payload).toEqual({ saleId: 'sale-1', listedPrice: 75 });
        });
    });

    describe('when the user genuinely changes status via the <select>', () => {
        it('forwards the new status', () => {
            const result = readPayload(
                buildForm({
                    status: 'SOLD',
                    currentStatus: 'PENDING',
                    listedPrice: '150',
                }),
                'sale-1',
            );

            expect(result.payload).toEqual({
                saleId: 'sale-1',
                status: 'SOLD',
                listedPrice: 150,
            });
        });
    });

    describe('when the status field is absent', () => {
        // CANCELLED/GIFTED sales render read-only text with no <select>, so
        // no `status` (or `currentStatus`) field exists on the form at all.
        it('omits status from the payload', () => {
            const result = readPayload(
                buildForm({ listedPrice: '150', invest: '90' }),
                'sale-1',
            );

            expect(result.payload).toEqual({
                saleId: 'sale-1',
                listedPrice: 150,
                invest: 90,
            });
        });
    });

    describe('validation', () => {
        describe('when listedPrice is below the minimum', () => {
            it('rejects the update', () => {
                const result = readPayload(buildForm({ listedPrice: '0' }), 'sale-1');

                expect(result.error).toBe('Listed price must be at least 1.');
                expect(result.payload).toBeUndefined();
            });
        });

        describe('when invest is negative', () => {
            it('rejects the update', () => {
                const result = readPayload(buildForm({ invest: '-5' }), 'sale-1');

                expect(result.error).toBe('Invest must be 0 or more.');
                expect(result.payload).toBeUndefined();
            });
        });
    });
});
