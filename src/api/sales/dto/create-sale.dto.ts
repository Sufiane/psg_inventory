import { OmitType } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import type { ListedPrice } from '@psg/shared/money';
import { AddSaleDto } from './add-sale.dto';
import { SALE_STATUS_TARGETS, SaleStatusTarget } from './update-sale.dto';

export class CreateSaleDto extends OmitType(AddSaleDto, ['listedPrice'] as const) {
    @IsOptional()
    @IsNumber()
    @Min(1)
    listedPrice?: ListedPrice;

    @IsOptional()
    @IsIn(SALE_STATUS_TARGETS)
    status?: SaleStatusTarget;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    recipientName?: string;
}
