import { Match } from '../../../db/matches/types/match.type';
import { FormattedMatch } from '../types/formatted-match.type';

export abstract class IMatchesService {
    abstract getSeasonMatches(
        seasonStartYear: string,
        withResult?: boolean,
    ): Promise<Match[]>;
    abstract getCurrentSeason(withResult?: boolean): Promise<FormattedMatch[]>;
    abstract getMatch(matchId: string, withResult?: boolean): Promise<FormattedMatch>;
}
