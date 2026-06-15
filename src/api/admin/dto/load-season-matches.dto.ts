import { Matches } from 'class-validator';

export class LoadSeasonMatchesDto {
    @Matches(/^\d{4}$/)
    seasonStartYear!: string;
}
