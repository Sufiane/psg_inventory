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
