import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$lib/guards';

export const load: LayoutServerLoad = (event) => {
    requireAdmin(event);

    return {};
};
