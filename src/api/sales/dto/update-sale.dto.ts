import { PartialType } from '@nestjs/swagger';
import {
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';
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

    /** @deprecated Use `status`. Kept one release so the web app and the api
     *  can deploy independently; `status` wins when both are present. */
    @IsOptional()
    @IsBoolean()
    sold?: boolean;

    @IsOptional()
    @IsUUID()
    recipientId?: RecipientId;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    recipientName?: string;
}
