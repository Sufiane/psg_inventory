import { IsInt, IsUUID, Min } from 'class-validator';
import type { SeasonPassId, TicketCount } from '@psg/shared';

export class SaleAllocationDto {
    @IsUUID()
    seasonPassId: SeasonPassId;

    @IsInt()
    @Min(1)
    nbTickets: TicketCount;
}
