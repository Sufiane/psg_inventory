import { Controller, Get, Param, Query } from '@nestjs/common';
import { GetCurrentSeasonDto } from './dto/get-current-season.dto';
import { MatchesService } from './matches.service';
import { GetMatchDto } from './dto/get-match.dto';

@Controller('matches')
export class MatchesController {

    constructor(private readonly matchesService: MatchesService) {
    }

    @Get('/current-season')
    getCurrentSeason(@Query() { withResult }: GetCurrentSeasonDto) {
        return this.matchesService.getCurrentSeason(withResult);
    }

    @Get('/:matchId')
    getMatch(
        @Param() { matchId }: GetMatchDto,
        @Query() { withResult }: GetCurrentSeasonDto,
    ) {
        return this.matchesService.getMatch(matchId, withResult);
    }
}
