import { parseAllocationsFromForm } from '$lib/sale-allocations';

/**
 * Two forms on this route submit to `?/update`: the gift form and the
 * edit-numbers form. Each declares itself through the hidden `intent` field,
 * because `status: 'GIFTED'` can arrive from either one for different
 * reasons and so cannot decide on its own whether a recipient is required.
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

    // Only the gift form asks about a recipient; the edit-numbers form sends
    // no `status` at all and the api leaves it untouched when absent.
    if (intent === 'gift') {
        const previousStatusRaw = form.get('previousStatus');
        const recipientNameRaw = form.get('recipientName');
        const recipientName =
            typeof recipientNameRaw === 'string' ? recipientNameRaw.trim() : '';

        // A name is required only on entry into GIFTED. An already-GIFTED
        // sale always has one (spec D9), so a blank submit means "keep it".
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
