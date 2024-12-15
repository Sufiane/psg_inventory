import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { FootballDataService } from '../../football-data/football-data.service';
import { MatchesService as MatchsDbService } from '../../db/matches/matches.service';
import { CreateMatchDto } from './dto/create-match.dto';

@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        private readonly footballDataService: FootballDataService,
        private readonly matchsDbService: MatchsDbService,
    ) {
    }

    async loadMatches(seasonStartYear?: number): Promise<void> {
        const PSG_ID = 524;

        const psgMatches = await this.footballDataService.getTeamMatches(
            PSG_ID,
            seasonStartYear,
        );

        this.logger.log(`Loading ${psgMatches.length} matches.`);

        await this.matchsDbService.loadMatches(psgMatches);
    }

    async createMatch(payload: CreateMatchDto): Promise<void> {
        try {
            await this.matchsDbService.createMatch(payload);
        } catch (e) {
            this.logger.error('match_creation_failed', {
                error: JSON.stringify(e, Object.getOwnPropertyNames(e)),
            });

            throw new InternalServerErrorException();
        }
    }
}
