import { Injectable, Logger } from '@nestjs/common';
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

    getMatch(matchId: string, withResult: boolean = false) {
        return this.matchsDbService.getOneMatch(matchId, withResult);
    }

    async loadMatches(): Promise<void> {
        const PSG_ID = 524;

        const psgMatches = await this.footballDataService.getTeamMatches(PSG_ID)

        this.logger.log(`Loading ${psgMatches.length} matches.`)

        await this.matchsDbService.loadMatches(psgMatches);
    }
}
