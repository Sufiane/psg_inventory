import { describe, expect, it } from 'vitest';
import { readPayload } from './read-payload';

/**
 * Builds the FormData a real submit would produce. Field sets mirror the two
 * forms on this route exactly — the gift-form and the edit-numbers form each
 * send a different, non-overlapping set of fields, which is the whole point
 * of the fix under test: `readPayload` must tell them apart by `intent`, not
 * by which optional fields happen to be present.
 */
function buildForm(fields: Record<string, string>): FormData {
    const form = new FormData();

    for (const [key, value] of Object.entries(fields)) {
        form.set(key, value);
    }

    return form;
}

/** Fields the edit-numbers form actually submits (see +page.svelte): no
 * `status`, no `previousStatus`, no `recipientName` — it never speaks to
 * status or the recipient at all. */
function editNumbersForm(overrides: Record<string, string> = {}): FormData {
    return buildForm({
        saleId: 'sale-1',
        intent: 'edit-numbers',
        listedPrice: '120',
        invest: '80',
        ...overrides,
    });
}

/** Fields the gift-form actually submits (see +page.svelte). */
function giftForm(overrides: Record<string, string> = {}): FormData {
    return buildForm({
        saleId: 'sale-1',
        intent: 'gift',
        status: 'GIFTED',
        previousStatus: 'PENDING',
        recipientName: '',
        ...overrides,
    });
}

describe('readPayload', () => {
    describe('edit-numbers form', () => {
        describe('when the sale is PENDING', () => {
            it('succeeds without a recipient-related error', () => {
                const result = readPayload(editNumbersForm());

                expect(result.error).toBeUndefined();
                expect(result.payload).toEqual({
                    saleId: 'sale-1',
                    listedPrice: 120,
                    invest: 80,
                });
            });
        });

        describe('when the sale is already GIFTED with a recipient attached', () => {
            // The regression: the edit-numbers form has no recipientName
            // field at all. Against code that gated the recipient-required
            // check on `status === 'GIFTED'` alone, this used to be
            // rejected with "Gift recipient is required." even though the
            // sale genuinely has a recipient — this form just never says so.
            it('succeeds without a recipient-related error', () => {
                const result = readPayload(editNumbersForm());

                expect(result.error).toBeUndefined();
                expect(result.payload).toEqual({
                    saleId: 'sale-1',
                    listedPrice: 120,
                    invest: 80,
                });
            });
        });
    });

    describe('gift-form', () => {
        describe('when transitioning from PENDING into GIFTED with no recipient name', () => {
            it('rejects the update', () => {
                const result = readPayload(giftForm({ previousStatus: 'PENDING' }));

                expect(result.error).toBe('Gift recipient is required.');
                expect(result.payload).toBeUndefined();
            });
        });

        describe('when transitioning into GIFTED with a recipient name', () => {
            it('accepts the update and forwards the recipient name', () => {
                const result = readPayload(
                    giftForm({
                        previousStatus: 'PENDING',
                        recipientName: 'Marc',
                    }),
                );

                expect(result.error).toBeUndefined();
                expect(result.payload).toEqual({
                    saleId: 'sale-1',
                    status: 'GIFTED',
                    recipientName: 'Marc',
                });
            });
        });

        describe('when the sale is already GIFTED with an existing recipient and the name field is left blank', () => {
            it('accepts the update, keeping the current recipient', () => {
                const result = readPayload(
                    giftForm({
                        previousStatus: 'GIFTED',
                        recipientName: '',
                    }),
                );

                expect(result.error).toBeUndefined();
                expect(result.payload).toEqual({
                    saleId: 'sale-1',
                    status: 'GIFTED',
                });
            });
        });
    });
});
