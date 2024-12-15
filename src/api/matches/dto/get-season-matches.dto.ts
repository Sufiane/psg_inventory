import { Matches } from 'class-validator';

export class GetSeasonMatchesDto {
    @Matches(/^\d{4}$/)
    seasonStartYear: string;
}
