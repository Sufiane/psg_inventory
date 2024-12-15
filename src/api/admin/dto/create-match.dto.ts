import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsObject,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import { Competition } from '@prisma/client';
import { Type } from 'class-transformer';

export class ResultDto {
    @IsBoolean()
    isWin: boolean;

    @Matches(/^\d{1,2} - \d{1,2}$/)
    score: string;
}

export class CreateMatchDto {
    @IsString()
    opponent: string;

    @IsDateString({ strict: true })
    date: string;

    @IsBoolean()
    atHome: boolean;

    @IsEnum(Competition)
    competition: Competition;

    @IsOptional()
    @IsObject()
    @Type(() => ResultDto)
    result?: ResultDto;
}
