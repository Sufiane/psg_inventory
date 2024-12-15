import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AddSaleDto {
    @IsString()
    matchId: string;

    @IsNumber()
    nbTickets: number;

    @IsOptional()
    @IsNumber()
    invest: number = 0;

    @IsNumber()
    listedPrice: number;
}
