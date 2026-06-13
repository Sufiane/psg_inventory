import { Injectable, Logger } from '@nestjs/common';
import type { MatchScore, OpponentName } from '@psg/shared';

import { DomainException } from '../common/exceptions/domain.exception';
import { ErrorCode } from '../common/exceptions/error-codes.enum';
import { ConfigService } from '@nestjs/config';
import { TeamMatches } from './types/football-data-api.type';
import { FormattedMatch } from '../shared/types/formatted-match.type';
import qs from 'qs';

@Injectable()
export class FootballDataService {
    private readonly logger = new Logger(FootballDataService.name);

    constructor(
        private readonly configService: ConfigService<
            {
                FOOTBALL_DATA_API_KEY: string;
            },
            true
        >,
    ) {}

    async getTeamMatches(
        teamId: number,
        seasonStartYear?: number,
    ): Promise<FormattedMatch[]> {
        const query = seasonStartYear ? qs.stringify({ season: seasonStartYear }) : '';

        const apiResponse = await fetch(
            `https://api.football-data.org/v4/teams/${teamId}/matches?${query}`,
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

            throw new DomainException(ErrorCode.COULD_NOT_LOAD_MATCHES);
        }

        const response = (await apiResponse.json()) as TeamMatches;

        return response.matches.map((match) => {
            const isAtHome = match.homeTeam.id === teamId;
            const hasScore =
                match.score.fullTime.home !== null && match.score.fullTime.away !== null;

            return {
                competition: match.competition.name,
                date: match.utcDate,
                atHome: isAtHome,
                opponent: (isAtHome
                    ? match.awayTeam.name
                    : match.homeTeam.name) as OpponentName,
                result: hasScore
                    ? {
                          isWin: isAtHome
                              ? match.score.winner === 'HOME_TEAM'
                              : match.score.winner === 'AWAY_TEAM',
                          score: `${match.score.fullTime.home} - ${match.score.fullTime.away}` as MatchScore,
                      }
                    : undefined,
            };
        });
    }
}
