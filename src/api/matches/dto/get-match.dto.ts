import { IsString } from 'class-validator';
import type { MatchId } from '@psg/shared/ids';

export class GetMatchDto {
    @IsString()
    matchId: MatchId;
}
