import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import { COMPETITIONS, type Competition, type FormattedMatch } from '$lib/types';

type Venue = 'both' | 'home' | 'away';

function isCompetition(value: string): value is Competition {
    return (COMPETITIONS as readonly string[]).includes(value);
}

export const load: PageServerLoad = async (event) => {
    const yearParam = event.url.searchParams.get('year');
    const year = yearParam ? Number.parseInt(yearParam, 10) : null;

    const venueParam = event.url.searchParams.get('venue');
    const venue: Venue =
        venueParam === 'home' || venueParam === 'away' ? venueParam : 'both';

    const competitionParam = event.url.searchParams.get('competition');
    const competition: Competition | 'all' =
        competitionParam && isCompetition(competitionParam) ? competitionParam : 'all';

    const path =
        year && Number.isFinite(year)
            ? `/matches/season/${year}?withResult=true`
            : '/matches/current-season?withResult=true';

    const all = await api<FormattedMatch[]>(event, path);

    const matches = all.filter((match) => {
        if (venue === 'home' && !match.atHome) {
            return false;
        }

        if (venue === 'away' && match.atHome) {
            return false;
        }

        if (competition !== 'all' && match.competition !== competition) {
            return false;
        }

        return true;
    });

    return { matches, year, venue, competition, competitions: COMPETITIONS };
};
