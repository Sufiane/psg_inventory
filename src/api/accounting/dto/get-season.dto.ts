import { Matches } from 'class-validator';

export class GetSeasonDto {
    @Matches(/^\d{4}$/)
    seasonStartYear: string;
}
