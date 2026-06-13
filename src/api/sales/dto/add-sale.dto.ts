import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

import type { MatchId } from '@psg/shared';
import { SaleAllocationDto } from './sale-allocation.dto';

export class AddSaleDto {
    @IsString()
    matchId: MatchId;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => SaleAllocationDto)
    allocations: SaleAllocationDto[];

    @IsOptional()
    @IsNumber()
    @Min(0)
    invest: number = 0;

    @IsNumber()
    @Min(1)
    listedPrice: number;
}
