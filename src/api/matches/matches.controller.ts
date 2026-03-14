import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { QueryMatchDto } from './dto/query-match.dto';
import { IMatchesService } from './interfaces/matches.service.interface';
import { GetMatchDto } from './dto/get-match.dto';
import { GetSeasonMatchesDto } from './dto/get-season-matches.dto';
import { formatMatch } from './formatters/format-match.formatter';
import { FormattedMatch } from './types/formatted-match.type';

@Controller('matches')
export class MatchesController {
    constructor(private readonly matchesService: IMatchesService) {}

    @Get('/current-season')
    async getCurrentSeason(
        @Query() { withResult }: QueryMatchDto,
    ): Promise<FormattedMatch[]> {
        return this.matchesService.getCurrentSeason(withResult);
    }

    @Get('/season/:seasonStartYear')
    async getSeasonMatches(
        @Param() { seasonStartYear }: GetSeasonMatchesDto,
        @Query() { withResult }: QueryMatchDto,
    ): Promise<FormattedMatch[]> {
        const matches = await this.matchesService.getSeasonMatches(
            seasonStartYear,
            withResult,
        );

        return matches.map((match) => formatMatch(match, withResult));
    }

    @Get('/:matchId')
    async getMatch(
        @Param() { matchId }: GetMatchDto,
        @Query() { withResult }: QueryMatchDto,
    ) {
        const result = await this.matchesService.getMatch(matchId, withResult);

        if (!result) {
            throw new BadRequestException('match_not_found');
        }

        return result;
    }
}
