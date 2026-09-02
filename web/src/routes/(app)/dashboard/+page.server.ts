import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { api } from '$lib/api';
import type { AskAnswer, FormattedMatch, TimePeriodAccounting } from '$lib/types';

export const load: PageServerLoad = (event) => {
    // Streamed: both fly to the client independently and the page shell
    // renders immediately with skeletons in their slots.
    const accounting = api<TimePeriodAccounting>(event, '/accounting/current-season');
    const matches = api<FormattedMatch[]>(
        event,
        '/matches/current-season?withResult=true',
    );

    return { accounting, matches };
};

export const actions: Actions = {
    ask: async (event) => {
        const form = await event.request.formData();
        const question = String(form.get('question') ?? '').trim();

        if (question.length < 3) {
            return fail(400, { question, message: 'Ask a longer question.' });
        }

        try {
            const answer = await api<AskAnswer>(event, '/ask', {
                method: 'POST',
                json: { question },
            });

            return { answer };
        } catch (error) {
            const status = (error as { status?: number }).status ?? 500;

            // api() already deleted the JWT cookie on a 401 (see $lib/api.ts).
            // Send the user through the same expired-session path as
            // requireAuth() in $lib/guards.ts instead of leaving them on the
            // dashboard with a session that will fail again on every retry.
            if (status === 401) {
                const next = encodeURIComponent(event.url.pathname + event.url.search);

                throw redirect(303, `/login?next=${next}`);
            }

            const message =
                status === 429
                    ? 'Too many questions for now. Try again in a little while.'
                    : 'Could not answer that right now. Try again.';

            return fail(status, { question, message });
        }
    },
};
