import { IsString } from 'class-validator';
import type { MatchId } from '@psg/shared';

export class GetMatchDto {
    @IsString()
    matchId: MatchId;
}
