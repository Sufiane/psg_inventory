import { FormattedMatch } from '../types/formatted-match.type';

// todo improve typing
export const formatMatch = (match: any, withResult: boolean = false): FormattedMatch => {
    return {
        id: match.id,
        date: match.date,
        atHome: match.atHome,
        competition: match.competition,
        opponent: match.Opponent,
        result: withResult
                ? {
                isWin: match.MatchResults?.isWin,
                score: match.MatchResults?.score,
            }
                : undefined,
    };
};
