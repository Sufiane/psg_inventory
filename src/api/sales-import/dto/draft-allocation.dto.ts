import { IsInt, IsUUID, Min } from 'class-validator';

export class DraftAllocationDto {
    @IsUUID('4')
    seasonPassId!: string;

    @IsInt()
    @Min(1)
    nbTickets!: number;
}
