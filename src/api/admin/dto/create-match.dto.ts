import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsObject,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Competitions } from '../types/competitions.type';

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

    @IsEnum(Competitions)
    competition: Competitions;

    @IsOptional()
    @IsObject()
    @Type(() => ResultDto)
    result?: ResultDto;
}
