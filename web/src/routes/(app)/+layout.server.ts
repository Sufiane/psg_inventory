import type { LayoutServerLoad } from './$types';
import { requireAuth } from '$lib/guards';

export const load: LayoutServerLoad = (event) => {
    requireAuth(event);

    return {};
};
