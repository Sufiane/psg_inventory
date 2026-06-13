import { IsInt, IsString, MaxLength, Min } from 'class-validator';
import type {
    CategoryLabel,
    PassLabel,
    RowLabel,
    SeasonPassPrice,
    SeatLabel,
} from '@psg/shared';

export class UpdateSeasonPassDto {
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
