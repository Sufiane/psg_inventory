import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AddSaleDto {
    @IsString()
    matchId: string;

    @IsInt()
    @Min(1)
    nbTickets: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    invest: number = 0;

    @IsNumber()
    @Min(1)
    listedPrice: number;
}
