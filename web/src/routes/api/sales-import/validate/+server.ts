import { json, type RequestHandler } from '@sveltejs/kit';
import { api } from '$lib/api';
import type { ValidateResponse } from '$lib/types/sales-import';

export const POST: RequestHandler = async (event) => {
    const payload = await event.request.json();
    const result = await api<ValidateResponse>(event, '/sales/import/validate', {
        method: 'POST',
        json: payload,
    });

    return json(result);
};
