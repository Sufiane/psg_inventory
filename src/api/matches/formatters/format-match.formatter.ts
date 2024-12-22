import { FormattedMatch } from '../types/formatted-match.type';
import { Match } from '../../../db/matches/types/match.type';

export const formatMatch = (
    match: Match,
    withResult: boolean = false,
): FormattedMatch => {
    return {
        id: match.id,
        date: match.date.toISOString(),
        atHome: match.atHome,
        competition: match.competition,
        opponent: match.Opponent.name,
        result: withResult
            ? {
                  isWin: match.MatchResults?.isWin,
                  score: match.MatchResults?.score,
              }
            : undefined,
    };
};
