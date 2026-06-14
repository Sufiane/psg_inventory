import { Injectable } from '@nestjs/common';

import type { MatchId } from '@psg/shared/ids';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { add } from 'date-fns';
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
        const startSeasonDate = new Date(`${seasonStartYear}-08-01`);
        const endSeasonDate = add(startSeasonDate, { years: 1 });

        return this.matchsDbService.getMatches(
            {
                from: startSeasonDate,
                to: endSeasonDate,
            },
            withResult,
        );
    }

    async getCurrentSeason(withResult: boolean = false): Promise<FormattedMatch[]> {
        const currentSeasonDate = getCurrentSeasonDate();

        const dbResponse = await this.matchsDbService.getMatches(
            { from: currentSeasonDate.start, to: currentSeasonDate.end },
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
