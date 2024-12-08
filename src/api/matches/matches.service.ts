import { Injectable } from '@nestjs/common';
import { MatchesService as MatchsDbService } from '../../db/matches.service';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';


@Injectable()
export class MatchesService {

    constructor(private readonly matchsDbService: MatchsDbService) {
    }

    getCurrentSeason(withResult: boolean = false) {
        const currentSeasonDate = getCurrentSeasonDate();

        return this.matchsDbService.getMatchs(
            { from: currentSeasonDate.start, to: currentSeasonDate.end },
            withResult,
        );
    }

    getMatch(matchId: string, withResult: boolean = false) {
        return this.matchsDbService.getOneMatch(matchId, withResult);
    }
}
