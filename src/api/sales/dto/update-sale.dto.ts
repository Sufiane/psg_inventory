import { PartialType } from '@nestjs/swagger';
import { AddSaleDto } from './add-sale.dto';
import { IsBoolean, IsString } from 'class-validator';
import type { SaleId } from '@psg/shared';

export class UpdateSaleDto extends PartialType(AddSaleDto) {
    @IsString()
    saleId: SaleId;

    @IsBoolean()
    sold: boolean;
}
