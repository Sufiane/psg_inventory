import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class PreviewRequestDto {
    @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('4', { each: true })
    selectedPassIds!: string[];
}
