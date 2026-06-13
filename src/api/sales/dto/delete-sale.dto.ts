import { IsString } from 'class-validator';
import type { SaleId } from '@psg/shared';

export class DeleteSaleDto {
    @IsString()
    saleId: SaleId;
}
