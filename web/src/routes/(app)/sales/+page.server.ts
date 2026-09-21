import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import { splitByKickoff } from '$lib/matches';
import { parseAllocationsFromForm } from '$lib/sale-allocations';
import { parseSeasonYearParam, seasonStartYearFromDate } from '$lib/season';
import { readPayload } from './read-payload';
import type {
    FormattedMatch,
    RecipientListItem,
    SaleDetail,
    SaleListItem,
    SalesGroupListItem,
    SeasonPass,
} from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const editId = event.url.searchParams.get('edit');
    const isNew = event.url.searchParams.get('new') !== null;
    // `?year=` is a seasonStartYear, so it maps straight onto the
    // `/season/:seasonStartYear` routes for both sales and matches.
    const seasonYear = parseSeasonYearParam(event.url);
    let sales: SaleListItem[];
    let salesGroup: SalesGroupListItem | null = null;

    if (seasonYear === null) {
        const grouped = await api<SalesGroupListItem>(event, '/sales/grouped');
        sales = [...grouped.pending, ...grouped.terminal];
        salesGroup = grouped;
    } else {
        sales = await api<SaleListItem[]>(event, `/sales/season/${seasonYear}`);
    }

    let editSale: SaleDetail | null = null;
    let recipients: RecipientListItem[] = [];

    // Both panel-specific to the edit drawer: `/recipients` only feeds the
    // gift-recipient combobox rendered inside it, so there's no reason to pay
    // for that call — or let a failure of it take down the whole page — on
    // every list view. Fetched together so a slow/failing recipients call
    // can't block loading the sale itself, and vice versa.
    if (editId && !isNew) {
        const [saleResult, recipientsResult] = await Promise.allSettled([
            api<SaleDetail>(event, `/sales/${editId}`),
            api<RecipientListItem[]>(event, '/recipients'),
        ]);

        if (saleResult.status === 'fulfilled') {
            editSale = saleResult.value;
        }

        if (recipientsResult.status === 'fulfilled') {
            recipients = recipientsResult.value;
        }
    }

    // New sales are only ever logged against the current season: updateSale's
    // kickoff guard means a past-season sale could never be marked SOLD, and a
    // future season has no fixtures to offer. `/matches/current-season` derives
    // its season from seasonStartYearFromDate(new Date()) — the same function
    // on the same clock as this line — so an exact match is the honest test.
    // Computed server-side so it runs against the sanitized `seasonYear` rather
    // than the raw `?year=` param.
    const canCreate =
        seasonYear === null || seasonYear === seasonStartYearFromDate(new Date());

    let matches: FormattedMatch[] = [];
    // Unfiltered on purpose: ImportSalesModal groups this list by season and
    // renders a "Previous seasons" section, and the inline new-sale panel
    // filters it client-side by whatever match is picked. Both consumers need
    // every season present.
    const passes = await api<SeasonPass[]>(event, '/season-passes');

    if (isNew && !editId && canCreate) {
        // The whole calendar season comes back, earliest-first, played matches
        // included — the picker only offers the ones still to kick off.
        const allMatches = await api<FormattedMatch[]>(event, '/matches/current-season');

        matches = splitByKickoff(allMatches, new Date()).upcoming;
    }

    return {
        sales,
        salesGroup,
        year: seasonYear,
        editSale,
        matches,
        isNew,
        passes,
        recipients,
        canCreate,
    };
};

export const actions: Actions = {
    update: async (event) => {
        const form = await event.request.formData();
        const { payload, error } = readPayload(form);

        if (error || !payload) {
            return fail(400, { message: error ?? 'Invalid form.' });
        }

        try {
            await api(event, '/sales/update', {
                method: 'POST',
                json: payload,
                expectEmpty: true,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Update failed.';

            return fail(400, { message });
        }

        const yearParam = event.url.searchParams.get('year');
        const redirectTarget = yearParam ? `/sales?year=${yearParam}` : '/sales';

        throw redirect(303, redirectTarget);
    },

    delete: async (event) => {
        const form = await event.request.formData();
        const saleId = form.get('saleId');

        if (typeof saleId !== 'string' || saleId.length === 0) {
            return fail(400, { message: 'Missing sale id.' });
        }

        try {
            await api(event, `/sales/${saleId}`, { method: 'DELETE', expectEmpty: true });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Delete failed.';

            return fail(400, { message });
        }

        const yearParam = event.url.searchParams.get('year');
        const redirectTarget = yearParam ? `/sales?year=${yearParam}` : '/sales';

        throw redirect(303, redirectTarget);
    },

    create: async (event) => {
        const form = await event.request.formData();
        const matchId = form.get('matchId');
        const listedPrice = Number(form.get('listedPrice'));
        const investRaw = form.get('invest');
        const invest =
            investRaw !== null && investRaw !== '' ? Number(investRaw) : undefined;
        const allocations = parseAllocationsFromForm(form);

        if (typeof matchId !== 'string' || matchId.length === 0) {
            return fail(400, { message: 'Match is required.' });
        }

        if (allocations.length === 0) {
            return fail(400, {
                message: 'Pick at least one pass and how many tickets it contributes.',
            });
        }

        if (!Number.isFinite(listedPrice) || listedPrice < 1) {
            return fail(400, { message: 'Listed price must be at least 1.' });
        }

        if (invest !== undefined && (!Number.isFinite(invest) || invest < 0)) {
            return fail(400, { message: 'Invest must be 0 or more.' });
        }

        try {
            await api<{ id: string }>(event, '/sales', {
                method: 'POST',
                json: {
                    matchId,
                    allocations,
                    listedPrice,
                    ...(invest !== undefined ? { invest } : {}),
                },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create sale.';

            return fail(400, { message });
        }

        const yearParam = event.url.searchParams.get('year');
        const redirectTarget = yearParam ? `/sales?year=${yearParam}` : '/sales';

        throw redirect(303, redirectTarget);
    },
};
