import { parseAllocationsFromForm } from '$lib/sale-allocations';
import { validateWholeEuro } from '$lib/whole-euro';

/**
 * The PENDING/SOLD <select> always submits a value, even untouched. The
 * hidden `currentStatus` is what distinguishes that from a deliberate
 * change: resending an unchanged SOLD on a past-kickoff sale would trip the
 * backend's kickoff guard and reject a plain price edit.
 */
export function readPayload(
    form: FormData,
    saleId: string,
): { payload?: Record<string, unknown>; error?: string } {
    const statusRaw = form.get('status');
    const currentStatusRaw = form.get('currentStatus');
    const listedPriceRaw = form.get('listedPrice');
    const investRaw = form.get('invest');

    const payload: Record<string, unknown> = { saleId };

    if (
        (statusRaw === 'PENDING' || statusRaw === 'SOLD') &&
        statusRaw !== currentStatusRaw
    ) {
        payload.status = statusRaw;
    }

    const allocations = parseAllocationsFromForm(form);

    if (allocations.length > 0) {
        payload.allocations = allocations;
    }

    if (typeof listedPriceRaw === 'string' && listedPriceRaw.length > 0) {
        const value = Number(listedPriceRaw);

        const error = validateWholeEuro('listedPrice', value);

        if (error !== null) {
            return { error };
        }

        payload.listedPrice = value;
    }

    if (typeof investRaw === 'string' && investRaw.length > 0) {
        const value = Number(investRaw);

        const error = validateWholeEuro('invest', value);

        if (error !== null) {
            return { error };
        }

        payload.invest = value;
    }

    return { payload };
}
