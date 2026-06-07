import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class UpdateSeasonPassDto {
    @IsInt()
    @Min(0)
    price: number;

    @IsString()
    @MaxLength(64)
    label: string;

    @IsString()
    @MaxLength(64)
    category: string;

    @IsString()
    @MaxLength(32)
    row: string;

    @IsString()
    @MaxLength(32)
    seat: string;
}
