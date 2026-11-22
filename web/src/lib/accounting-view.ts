import type { MatchId } from '@psg/shared/ids';
import type { FormattedMatch, SaleListItem, SaleStatus } from './types';
import { dominantStatus } from './sale-math';

export function passCostPerMatch(passPrice: number, matchCount: number): number {
    if (matchCount === 0) {
        return 0;
    }

    return passPrice / matchCount;
}

export function homeMatchCount(matches: FormattedMatch[]): number {
    return matches.filter((match) => match.atHome).length;
}

export type StripSegment = {
    matchId: MatchId;
    opponent: string;
    date: string;
    status: SaleStatus | null;
    isBreakEven: boolean;
    atHome: boolean;
};

export function stripSegments(
    matches: FormattedMatch[],
    salesByMatch: Record<string, SaleListItem[]>,
    breakEvenMatchId: MatchId | null,
): StripSegment[] {
    return matches.map((match) => {
        const sales = salesByMatch[match.id] ?? [];
        const statuses = sales.map((sale) => sale.status);

        return {
            matchId: match.id,
            opponent: match.opponent,
            date: match.date,
            status: dominantStatus(statuses),
            isBreakEven: breakEvenMatchId !== null && match.id === breakEvenMatchId,
            atHome: match.atHome,
        };
    });
}

export type SeasonTableRow = {
    matchId: MatchId;
    opponent: string;
    date: string;
    competition: string;
    sales: SaleListItem[];
};

export function tableGroups(
    matches: FormattedMatch[],
    salesByMatch: Record<string, SaleListItem[]>,
): SeasonTableRow[] {
    const groups: SeasonTableRow[] = [];
    const listed = new Set<string>();

    for (const match of matches) {
        const sales = salesByMatch[match.id] ?? [];

        if (sales.length === 0) {
            continue;
        }

        listed.add(match.id);
        groups.push({
            matchId: match.id,
            opponent: match.opponent,
            date: match.date,
            competition: match.competition,
            sales,
        });
    }

    for (const sales of Object.values(salesByMatch)) {
        const matchId = sales[0]?.matchId;

        if (matchId == null || listed.has(matchId)) {
            continue;
        }

        groups.push({
            matchId,
            opponent: sales[0]?.opponent.name ?? '',
            date: sales[0]?.matchDate ?? '',
            competition: '',
            sales,
        });
    }

    return groups;
}

export function upcomingIndex(segments: StripSegment[], today: Date): number {
    if (segments.length === 0) {
        return -1;
    }

    const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
    ).getTime();
    const index = segments.findIndex(
        (segment) => new Date(segment.date).getTime() >= startOfToday,
    );

    return index === -1 ? segments.length - 1 : index;
}

export type Venue = 'both' | 'home' | 'away';

export function parseVenue(value: string | null): Venue {
    if (value === 'home' || value === 'away') {
        return value;
    }

    return 'both';
}

function matchesVenue(segment: StripSegment, venue: Venue): boolean {
    if (venue === 'both') {
        return true;
    }

    return venue === 'home' ? segment.atHome : !segment.atHome;
}

export function filterSegments(segments: StripSegment[], venue: Venue): StripSegment[] {
    return segments.filter((segment) => matchesVenue(segment, venue));
}

export function hiddenWithSales(segments: StripSegment[], venue: Venue): number {
    return segments.filter(
        (segment) => !matchesVenue(segment, venue) && segment.status !== null,
    ).length;
}

export function venueHref(url: URL, venue: Venue): string {
    const params = new URLSearchParams(url.searchParams);

    if (venue === 'both') {
        params.delete('venue');
    } else {
        params.set('venue', venue);
    }

    const search = params.toString();

    return search === '' ? url.pathname : `${url.pathname}?${search}`;
}

export function stripOpponent(segment: StripSegment): string {
    return segment.atHome ? segment.opponent : `@ ${segment.opponent}`;
}
