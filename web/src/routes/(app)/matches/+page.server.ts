import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import { splitByKickoff } from '$lib/matches';
import { parseSeasonYearParam, seasonStartYearFromDate } from '$lib/season';
import { COMPETITIONS, type Competition, type FormattedMatch } from '$lib/types';

type Venue = 'both' | 'home' | 'away';

function isCompetition(value: string): value is Competition {
    return (COMPETITIONS as readonly string[]).includes(value);
}

export const load: PageServerLoad = async (event) => {
    const seasonYear = parseSeasonYearParam(event.url);

    const venueParam = event.url.searchParams.get('venue');
    const venue: Venue =
        venueParam === 'home' || venueParam === 'away' ? venueParam : 'both';

    const competitionParam = event.url.searchParams.get('competition');
    const competition: Competition | 'all' =
        competitionParam && isCompetition(competitionParam) ? competitionParam : 'all';

    const path =
        seasonYear !== null
            ? `/matches/season/${seasonYear}?withResult=true`
            : '/matches/current-season?withResult=true';

    const all = await api<FormattedMatch[]>(event, path);

    const filtered = all.filter((match) => {
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

    const { upcoming, past } = splitByKickoff(filtered, new Date());
    // Unfiltered upcoming count, so an empty *filtered* upcoming list can be
    // told apart from a genuinely finished season: the venue/competition
    // filters can exclude every remaining fixture while the season still has
    // upcoming matches of some other venue/competition.
    const { upcoming: unfilteredUpcoming } = splitByKickoff(all, new Date());
    // A strictly-past season has nothing upcoming by definition. The page drops
    // the upcoming block entirely for one, and shows the season expanded rather
    // than hiding all of it behind a "show past matches" disclosure.
    const isPastSeason =
        seasonYear !== null && seasonYear < seasonStartYearFromDate(new Date());

    return {
        upcoming,
        past,
        // Pre-filter length, so "this season has no matches" can be told apart
        // from "your filters excluded everything".
        totalCount: all.length,
        filteredCount: filtered.length,
        totalUpcomingCount: unfilteredUpcoming.length,
        year: seasonYear,
        venue,
        competition,
        competitions: COMPETITIONS,
        isPastSeason,
    };
};
