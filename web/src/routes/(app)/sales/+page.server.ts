import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { SaleListItem } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const yearParam = event.url.searchParams.get('year');
    const year = yearParam ? Number.parseInt(yearParam, 10) : null;
    const path =
        year && Number.isFinite(year) ? `/sales/season/${year}` : '/sales/current-season';

    const sales = await api<SaleListItem[]>(event, path);

    return { sales, year };
};
