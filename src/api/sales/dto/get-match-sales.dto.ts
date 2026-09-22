import { IsString } from 'class-validator';
import type { MatchId } from '@psg/shared/ids';

export class GetMatchSalesDto {
    @IsString()
    matchId!: MatchId;
}
