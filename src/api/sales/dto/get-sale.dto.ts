import { IsString } from 'class-validator';
import type { SaleId } from '@psg/shared/ids';

export class GetSaleDto {
    @IsString()
    saleId: SaleId;
}
