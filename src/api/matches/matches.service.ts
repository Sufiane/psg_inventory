import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchesService as MatchsDbService } from '../../db/matches/matches.service';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { add } from 'date-fns';

@Injectable()
export class MatchesService {
    constructor(
        private readonly matchsDbService: MatchsDbService,
    ) {
    }

    getSeasonMatches(seasonStartYear: string, withResult: boolean = false) {
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

    getCurrentSeason(withResult: boolean = false) {
        const currentSeasonDate = getCurrentSeasonDate();

        return this.matchsDbService.getMatches(
            { from: currentSeasonDate.start, to: currentSeasonDate.end },
            withResult,
        );
    }

    async getMatch(matchId: string, withResult: boolean = false) {
        const match = await this.matchsDbService.getOneMatch(matchId, withResult);

        if (!match) {
            throw new NotFoundException('match_not_found');
        }

        return {
            id: match.id,
            date: match.date,
            atHome: match.atHome,
            competition: match.competition,
            opponent: match.Opponent,
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
