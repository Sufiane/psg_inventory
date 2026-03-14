import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { FootballDataService } from '../../football-data/football-data.service';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { CreateMatchDto } from './dto/create-match.dto';
import { PSG_ID } from '../../shared/constants';
import { IAdminService } from './interfaces/admin.service.interface';

@Injectable()
export class AdminService implements IAdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        private readonly footballDataService: FootballDataService,
        private readonly matchsDbService: IMatchesDbService,
    ) {}

    async loadMatches(seasonStartYear?: number): Promise<void> {
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
