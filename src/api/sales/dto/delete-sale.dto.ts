import { IsString } from 'class-validator';

export class DeleteSaleDto {
    @IsString()
    saleId: string
}
