import { IsUUID } from 'class-validator';

export class DeleteBatchDto {
    @IsUUID('4')
    batchId!: string;
}
