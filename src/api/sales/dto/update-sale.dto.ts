import { PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { RecipientId, SaleId } from '@psg/shared/ids';
import { AddSaleDto } from './add-sale.dto';

export type SaleStatusTarget = 'PENDING' | 'SOLD' | 'GIFTED';

const SALE_STATUS_TARGETS: SaleStatusTarget[] = ['PENDING', 'SOLD', 'GIFTED'];

export class UpdateSaleDto extends PartialType(AddSaleDto) {
    @IsString()
    saleId!: SaleId;

    @IsOptional()
    @IsIn(SALE_STATUS_TARGETS)
    status?: SaleStatusTarget;

    @IsOptional()
    @IsUUID()
    recipientId?: RecipientId;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    recipientName?: string;
}
