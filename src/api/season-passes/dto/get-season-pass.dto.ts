import { Matches } from 'class-validator';

export class GetSeasonPassDto {
    @Matches(/^\d{4}$/)
    seasonStartYear: string;
}
