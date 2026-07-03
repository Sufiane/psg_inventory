import { json, type RequestHandler } from '@sveltejs/kit';
import { api } from '$lib/api';
import type { RevertResult } from '$lib/types/sales-import';

export const DELETE: RequestHandler = async (event) => {
    const { batchId } = event.params;
    const result = await api<RevertResult>(event, `/sales/import/${batchId}`, {
        method: 'DELETE',
    });

    return json(result);
};
