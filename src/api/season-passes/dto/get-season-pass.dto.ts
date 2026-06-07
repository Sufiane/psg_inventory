import { IsUUID } from 'class-validator';

export class GetSeasonPassDto {
    @IsUUID()
    passId: string;
}
