import { IsInt, IsUUID, Min } from 'class-validator';
import type { TicketCount } from '@psg/shared/counts';
import type { SeasonPassId } from '@psg/shared/ids';

export class SaleAllocationDto {
    @IsUUID()
    seasonPassId: SeasonPassId;

    @IsInt()
    @Min(1)
    nbTickets: TicketCount;
}
