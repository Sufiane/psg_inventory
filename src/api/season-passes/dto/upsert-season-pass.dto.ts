import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpsertSeasonPassDto {
    @IsInt()
    @Min(0)
    price: number;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    category?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    row?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    seat?: string;
}
