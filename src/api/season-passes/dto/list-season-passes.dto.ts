import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListSeasonPassesDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1900)
    @Max(2999)
    season?: number;
}
