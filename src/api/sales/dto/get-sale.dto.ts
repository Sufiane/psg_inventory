import { IsString } from 'class-validator';

export class GetSaleDto {
    @IsString()
    saleId: string
}
