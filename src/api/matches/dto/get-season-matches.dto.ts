import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import type { SeasonYear } from '@psg/shared/time';

export class GetSeasonMatchesDto {
    // ValidationPipe's transform:true runs @Type before validation, so this
    // arrives as a number and the controller no longer needs to cast it.
    @Type(() => Number)
    @IsInt()
    @Min(2020)
    @Max(2100)
    seasonStartYear!: SeasonYear;
}
