import { IsOptional, Matches } from 'class-validator';

export class LoadMatchesDto {
    @IsOptional()
    @Matches(/^\d{4}$/)
    seasonStartYear?: string;
}
