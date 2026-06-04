import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { convertStringToBoolean } from '../../../shared/utils/string-to-boolean.utils';

export class QueryHealthDto {
    @Transform(({ value }) => convertStringToBoolean(value))
    @IsOptional()
    @IsBoolean()
    db?: boolean;
}
