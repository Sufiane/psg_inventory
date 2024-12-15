import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
} from '@nestjs/common';
import { QueryMatchDto } from './dto/query-match.dto';
import { MatchesService } from './matches.service';
import { GetMatchDto } from './dto/get-match.dto';
import { LoadMatchesDto } from './dto/load-matches.dto';
import { GetSeasonMatchesDto } from './dto/get-season-matches.dto';
import { formatMatch } from './formatters/format-match.formatter';
import { FormattedMatch } from './types/formatted-match.type';

@Controller('matches')
export class MatchesController {
    constructor(private readonly matchesService: MatchesService) {}

    @Get('/current-season')
    async getCurrentSeason(
        @Query() { withResult }: QueryMatchDto,
    ): Promise<FormattedMatch[]> {
        const matches = await this.matchesService.getCurrentSeason(withResult);

        return matches.map((match) => formatMatch(match, withResult));
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

    // todo need to move this to an admin routes ?
    @Post('load')
    async loadMatches(@Body() { seasonStartYear }: LoadMatchesDto) {
        await this.matchesService.loadMatches(
            seasonStartYear ? parseInt(seasonStartYear, 10) : undefined,
        );
    }
}
