import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MatchesService as MatchsDbService } from '../../db/matches/matches.service';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { FootballDataService } from "../../football-data/football-data.service";


@Injectable()
export class MatchesService {
    private readonly logger = new Logger(MatchesService.name)

    constructor(
        private readonly matchsDbService: MatchsDbService,
        private readonly footballDataService: FootballDataService
    ) {}

    getCurrentSeason(withResult: boolean = false) {
        const currentSeasonDate = getCurrentSeasonDate();

        return this.matchsDbService.getMatches(
            { from: currentSeasonDate.start, to: currentSeasonDate.end },
            withResult,
        );
    }

    async getMatch(matchId: string, withResult: boolean = false) {
        const match = await this.matchsDbService.getOneMatch(matchId, withResult);

        if(!match) {
            throw new NotFoundException('match_not_found')
        }

        return {
            id: match.id,
            date: match.date,
            atHome: match.atHome,
            competition: match.competition,
            opponent: match.Opponent,
            result: withResult && match.MatchResults ? {
                isWin: match.MatchResults?.isWin,
                score: match.MatchResults?.score,
            } : undefined,
        }
    }

    async loadMatches(): Promise<void> {
        const PSG_ID = 524;

        const psgMatches = await this.footballDataService.getTeamMatches(PSG_ID)

        this.logger.log(`Loading ${psgMatches.length} matches.`)

        await this.matchsDbService.loadMatches(psgMatches);
    }
}
