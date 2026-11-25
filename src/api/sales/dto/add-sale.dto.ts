import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

import type { MatchId } from '@psg/shared/ids';
import type { Invest, ListedPrice } from '@psg/shared/money';
import { SaleAllocationDto } from './sale-allocation.dto';

export class AddSaleDto {
    @IsString()
    matchId!: MatchId;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => SaleAllocationDto)
    allocations!: SaleAllocationDto[];

    @IsOptional()
    @IsInt({ message: 'invest_must_be_integer' })
    @Min(0)
    invest: Invest = 0 as Invest;

    @IsInt({ message: 'listed_price_must_be_integer' })
    @Min(1)
    listedPrice!: ListedPrice;
}
