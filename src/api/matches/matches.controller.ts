import { BadRequestException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { GetCurrentSeasonDto } from './dto/get-current-season.dto';
import { MatchesService } from './matches.service';
import { GetMatchDto } from './dto/get-match.dto';

@Controller('matches')
export class MatchesController {

    constructor(private readonly matchesService: MatchesService) {
    }

    @Get('/current-season')
    async getCurrentSeason(@Query() { withResult }: GetCurrentSeasonDto) {
        const matches = await this.matchesService.getCurrentSeason(withResult);

        return matches.map(match => {
            return {
                id: match.id,
                date: match.date,
                atHome: match.atHome,
                competition: match.competition,
                opponent: match.Opponent,
                result: withResult ? {
                    isWin: match.MatchResults?.isWin,
                    score: match.MatchResults?.score,
                } : undefined,
            };
        });
    }

    @Get('/:matchId')
    async getMatch(
        @Param() { matchId }: GetMatchDto,
        @Query() { withResult }: GetCurrentSeasonDto,
    ) {
        const result = await this.matchesService.getMatch(matchId, withResult);

        if (!result) {
            throw new BadRequestException('match_not_found');
        }

        return result;
    }

    // todo need to move this to an admin routes ?
    @Post('load')
    async loadMatches() {
        await this.matchesService.loadMatches();
    }
}
