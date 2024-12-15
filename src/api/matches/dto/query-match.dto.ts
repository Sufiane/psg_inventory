import { IsBoolean, IsOptional } from 'class-validator';
import { convertStringToBoolean } from '../../../shared/utils/string-to-boolean.utils';
import { Transform } from 'class-transformer';

export class QueryMatchDto {
    @Transform(({ value }) => convertStringToBoolean(value))
    @IsOptional()
    @IsBoolean()
    withResult?: boolean;
}
