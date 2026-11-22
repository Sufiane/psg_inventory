import { fail, redirect } from '@sveltejs/kit';
import type { SeasonYear } from '@psg/shared/time';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import { splitByKickoff } from '$lib/matches';
import { parseAllocationsFromForm } from '$lib/sale-allocations';
import { validateWholeEuro } from '$lib/whole-euro';
import { homeMatchCount } from '$lib/accounting-view';
import { resolveSeason, seasonStartYearFromDate } from '$lib/season';
import { readPayload } from './read-payload';
import type {
    CommissionResponse,
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
    const season = resolveSeason(event.url, true);
    const currentSeason = seasonStartYearFromDate(new Date());
    let sales: SaleListItem[];
    let year: SeasonYear | null = null;

    if (season === currentSeason) {
        const grouped = await api<SalesGroupListItem>(event, '/sales/grouped');
        sales = [...grouped.pending, ...grouped.terminal];
    } else if (season === 'all') {
        sales = await api<SaleListItem[]>(event, '/sales');
    } else {
        sales = await api<SaleListItem[]>(event, `/sales/season/${season}`);
        year = season;
    }

    let editSale: SaleDetail | null = null;
    let recipients: RecipientListItem[] = [];
    let editHomeFixtures: number | null = null;

    let commissionPercent: number | null = null;

    if (editId && !isNew) {
        const [saleResult, recipientsResult, commissionResult] = await Promise.allSettled([
            api<SaleDetail>(event, `/sales/${editId}`),
            api<RecipientListItem[]>(event, '/recipients'),
            api<CommissionResponse>(event, '/sales/commission'),
        ]);

        if (saleResult.status === 'fulfilled') {
            editSale = saleResult.value;
        }

        if (recipientsResult.status === 'fulfilled') {
            recipients = recipientsResult.value;
        }

        if (commissionResult.status === 'fulfilled') {
            commissionPercent = commissionResult.value.commissionPercent;
        }

        if (editSale) {
            const saleSeason = seasonStartYearFromDate(new Date(editSale.Match.date));

            try {
                editHomeFixtures = homeMatchCount(
                    await api<FormattedMatch[]>(event, `/matches/season/${saleSeason}`),
                );
            } catch {
                editHomeFixtures = null;
            }
        }
    }

    // New sales are only ever logged against the current season: updateSale's
    // kickoff guard means a past-season sale could never be marked SOLD, and a
    // future season has no fixtures to offer.
    const canCreate = season === 'all' || season === currentSeason;

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
        commissionPercent,
        editHomeFixtures,
        sales,
        year,
        season,
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

        const listedPriceError = validateWholeEuro('listedPrice', listedPrice);

        if (listedPriceError !== null) {
            return fail(400, { message: listedPriceError });
        }

        const investError = invest === undefined ? null : validateWholeEuro('invest', invest);

        if (investError !== null) {
            return fail(400, { message: investError });
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
