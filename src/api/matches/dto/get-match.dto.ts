import { IsString } from 'class-validator';

export class GetMatchDto {
    @IsString()
    matchId: string
}
