import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { SeasonYear } from '@psg/shared';

export class ListSeasonPassesDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1900)
    @Max(2999)
    season?: SeasonYear;
}
