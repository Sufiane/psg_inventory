import { PartialType } from '@nestjs/swagger';
import { AddSaleDto } from './add-sale.dto';
import { IsBoolean, IsString } from 'class-validator';

export class UpdateSaleDto extends PartialType(AddSaleDto) {
    @IsString()
    saleId: string;

    @IsBoolean()
    sold: boolean;
}
