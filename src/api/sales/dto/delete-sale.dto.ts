import { IsString } from 'class-validator';
import type { SaleId } from '@psg/shared/ids';

export class DeleteSaleDto {
    @IsString()
    saleId: SaleId;
}
