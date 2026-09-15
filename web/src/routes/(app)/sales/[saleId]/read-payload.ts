import { parseAllocationsFromForm } from '$lib/sale-allocations';

/**
 * This route's single form always submits a `status` value when the
 * PENDING/SOLD <select> is rendered — even when the user never touched it,
 * since a <select> always has a selected option. Resending the sale's
 * unchanged current status trips the backend's kickoff guard for an
 * already-SOLD, past-kickoff sale (`isKickoffGuarded('SOLD', 'SOLD')` is
 * unconditional), rejecting a plain price/invest edit with
 * `SALE_AFTER_KICKOFF`. The form also submits a hidden `currentStatus`
 * (the sale's status as loaded) so status is only forwarded on a genuine,
 * deliberate change — mirroring how the sales-list edit-numbers form omits
 * `status` entirely rather than resubmitting the current value.
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

        if (!Number.isFinite(value) || value < 1) {
            return { error: 'Listed price must be at least 1.' };
        }

        payload.listedPrice = value;
    }

    if (typeof investRaw === 'string' && investRaw.length > 0) {
        const value = Number(investRaw);

        if (!Number.isFinite(value) || value < 0) {
            return { error: 'Invest must be 0 or more.' };
        }

        payload.invest = value;
    }

    return { payload };
}
