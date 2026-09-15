import { parseAllocationsFromForm } from '$lib/sale-allocations';

/**
 * Two different forms on this route submit to `?/update`: the gift-form
 * (whose whole job is starting or updating a gift) and the edit-numbers form
 * (price/invest/allocations — it never touches status or the recipient).
 * Each declares its own intent explicitly via the hidden `intent` field
 * rather than being inferred from which optional fields happen to be
 * present — that inference is what broke this three times over: a `status`
 * value of `GIFTED` can arrive from either form for entirely different
 * reasons, so it can't be used on its own to decide whether a recipient is
 * required.
 */
export function readPayload(form: FormData): {
    payload?: Record<string, unknown>;
    error?: string;
} {
    const saleId = form.get('saleId');

    if (typeof saleId !== 'string' || saleId.length === 0) {
        return { error: 'Missing sale id.' };
    }

    const intent = form.get('intent');
    const statusRaw = form.get('status');
    const payload: Record<string, unknown> = { saleId };

    if (statusRaw === 'PENDING' || statusRaw === 'SOLD' || statusRaw === 'GIFTED') {
        payload.status = statusRaw;
    }

    // Only the gift-form's own submission needs a recipient. The
    // edit-numbers form never sends `intent="gift"` (in fact it no longer
    // sends `status` at all — UpdateSaleDto.status is optional, and the api
    // leaves status untouched when it's absent), so this block only ever
    // runs for the form that is actually asking about the recipient.
    if (intent === 'gift') {
        const previousStatusRaw = form.get('previousStatus');
        const recipientNameRaw = form.get('recipientName');
        const recipientName =
            typeof recipientNameRaw === 'string' ? recipientNameRaw.trim() : '';

        // A name is required only on a genuine entry into GIFTED. An
        // already-GIFTED sale always has a recipient to fall back to (spec
        // D9), so a blank submit there can only mean "keep it" — the api
        // leaves the existing recipient untouched when none is supplied.
        if (previousStatusRaw !== 'GIFTED' && recipientName.length === 0) {
            return { error: 'Gift recipient is required.' };
        }

        if (recipientName.length > 0) {
            payload.recipientName = recipientName;
        }
    }

    const allocations = parseAllocationsFromForm(form);

    if (allocations.length > 0) {
        payload.allocations = allocations;
    }

    const listedPriceRaw = form.get('listedPrice');

    if (typeof listedPriceRaw === 'string' && listedPriceRaw.length > 0) {
        const value = Number(listedPriceRaw);

        if (!Number.isFinite(value) || value < 1) {
            return { error: 'Listed price must be at least 1.' };
        }

        payload.listedPrice = value;
    }

    const investRaw = form.get('invest');

    if (typeof investRaw === 'string' && investRaw.length > 0) {
        const value = Number(investRaw);

        if (!Number.isFinite(value) || value < 0) {
            return { error: 'Invest must be 0 or more.' };
        }

        payload.invest = value;
    }

    return { payload };
}
