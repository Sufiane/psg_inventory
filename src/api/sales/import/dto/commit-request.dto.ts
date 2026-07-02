import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { DraftRowDto } from './draft-row.dto';

export class CommitRequestDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('4', { each: true })
    selectedPassIds!: string[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DraftRowDto)
    rows!: DraftRowDto[];
}
