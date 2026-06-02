import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { SaleListItem } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const sales = await api<SaleListItem[]>(event, '/sales');

    return { sales };
};
