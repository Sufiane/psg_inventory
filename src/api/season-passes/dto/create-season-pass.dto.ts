import { IsInt, IsString, MaxLength, Min } from 'class-validator';
import type {
    CategoryLabel,
    PassLabel,
    RowLabel,
    SeasonYear,
    SeatLabel,
} from '@psg/shared';

export class CreateSeasonPassDto {
    @IsInt()
    @Min(1900)
    seasonStartYear: SeasonYear;

    @IsInt()
    @Min(0)
    price: number;

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
