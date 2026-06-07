import { IsInt, IsUUID, Min } from 'class-validator';

export class SaleAllocationDto {
    @IsUUID()
    seasonPassId: string;

    @IsInt()
    @Min(1)
    nbTickets: number;
}
