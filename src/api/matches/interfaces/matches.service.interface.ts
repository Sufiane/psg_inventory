import type { MatchId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { Match } from '../../../db/matches/types/match.type';
import { FormattedMatch } from '../types/formatted-match.type';

export abstract class IMatchesService {
    abstract getSeasonMatches(
        seasonStartYear: SeasonYear,
        withResult?: boolean,
    ): Promise<Match[]>;
    abstract getCurrentSeason(withResult?: boolean): Promise<FormattedMatch[]>;
    abstract getMatch(matchId: MatchId, withResult?: boolean): Promise<FormattedMatch>;
}
