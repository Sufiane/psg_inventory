import { Matches } from 'class-validator';

export class GetSeasonSalesDto {
    @Matches(/^\d{4}$/)
    seasonStartYear: string;
}
