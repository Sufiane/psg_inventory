import { IsInt, IsUUID, Min } from 'class-validator';
import type { SeasonPassId } from '@psg/shared';

export class SaleAllocationDto {
    @IsUUID()
    seasonPassId: SeasonPassId;

    @IsInt()
    @Min(1)
    nbTickets: number;
}
