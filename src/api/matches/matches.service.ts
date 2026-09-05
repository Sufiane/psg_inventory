import { Injectable } from '@nestjs/common';

import type { MatchId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { getSeasonWindow, getSeasonBucket } from '../../shared/utils/season.utils';
import { formatMatch } from './formatters/format-match.formatter';
import { FormattedMatch } from './types/formatted-match.type';
import { Match } from '../../db/matches/types/match.type';
import { IMatchesService } from './interfaces/matches.service.interface';

@Injectable()
export class MatchesService implements IMatchesService {
    constructor(private readonly matchsDbService: IMatchesDbService) {}

    getSeasonMatches(
        seasonStartYear: string,
        withResult: boolean = false,
    ): Promise<Match[]> {
        const { start: from, end: to } = getSeasonWindow(
            Number(seasonStartYear) as SeasonYear,
            'exclusive',
        );

        return this.matchsDbService.getMatches({ from, to }, withResult);
    }

    async getCurrentSeason(withResult: boolean = false): Promise<FormattedMatch[]> {
        const now = new Date();
        const earliestUpcoming =
            await this.matchsDbService.getEarliestUpcomingMatchDate();
        const season = getSeasonBucket(earliestUpcoming ?? now);

        const dbResponse = await this.matchsDbService.getMatches(
            { from: now, to: season.end },
            withResult,
        );

        return dbResponse.map((match) => formatMatch(match, withResult));
    }

    async getMatch(matchId: MatchId, withResult: boolean = false) {
        const match = await this.matchsDbService.getOneMatch(matchId, withResult);

        if (!match) {
            throw new DomainException(ErrorCode.MATCH_NOT_FOUND);
        }

        return {
            id: match.id,
            date: match.date.toISOString(),
            atHome: match.atHome,
            competition: match.competition,
            opponent: match.Opponent.name,
            result:
                withResult && match.MatchResults
                    ? {
                          isWin: match.MatchResults?.isWin,
                          score: match.MatchResults?.score,
                      }
                    : undefined,
        };
    }
}
