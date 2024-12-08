import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TeamMatches } from './types/football-data-api.type';
import { FormattedMatch } from '../shared/types/formatted-match.type';

@Injectable()
export class FootballDataService {
    private readonly logger = new Logger(FootballDataService.name);

    constructor(
        private readonly configService: ConfigService<{
            FOOTBALL_DATA_API_KEY: string
        }, true>,
    ) {
    }

    async getTeamMatches(teamId: number): Promise<FormattedMatch[]> {
        const apiResponse = await fetch(
            `https://api.football-data.org/v4/teams/${teamId}/matches`,
            {
                headers: {
                    'X-Auth-Token': this.configService.get('FOOTBALL_DATA_API_KEY'),
                },
            },
        );

        if (!apiResponse.ok) {
            const response = await apiResponse.json();

            this.logger.error('Could not load matches', {
                message: response.message,
                errorCode: response.errorCode,
                status: response.status,
            });

            throw new InternalServerErrorException('could_not_load_matches');
        }

        const response = await apiResponse.json() as TeamMatches;

        return response.matches.map((match) => {
            const isAtHome = match.homeTeam.id === teamId;

            return {
                competition: match.competition.name,
                date: match.utcDate,
                atHome: isAtHome,
                opponent: isAtHome ? match.awayTeam.name : match.homeTeam.name,
                result: {
                    isWin: isAtHome
                           ? match.score.winner === 'HOME_TEAM'
                           : match.score.winner === 'AWAY_TEAM',
                    score: `${match.score.fullTime.home} - ${match.score.fullTime.away}`,
                },
            };
        });
    }
}
