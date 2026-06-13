import { IsString } from 'class-validator';
import type { SaleId } from '@psg/shared';

export class GetSaleDto {
    @IsString()
    saleId: SaleId;
}
