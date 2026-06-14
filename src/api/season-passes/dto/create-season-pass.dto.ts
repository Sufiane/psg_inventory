import { IsInt, IsString, MaxLength, Min } from 'class-validator';
import type { SeasonPassPrice } from '@psg/shared/money';
import type { CategoryLabel, PassLabel, RowLabel, SeatLabel } from '@psg/shared/strings';
import type { SeasonYear } from '@psg/shared/time';

export class CreateSeasonPassDto {
    @IsInt()
    @Min(1900)
    seasonStartYear: SeasonYear;

    @IsInt()
    @Min(0)
    price: SeasonPassPrice;

    @IsString()
    @MaxLength(64)
    label: PassLabel;

    @IsString()
    @MaxLength(64)
    category: CategoryLabel;

    @IsString()
    @MaxLength(32)
    row: RowLabel;

    @IsString()
    @MaxLength(32)
    seat: SeatLabel;
}
