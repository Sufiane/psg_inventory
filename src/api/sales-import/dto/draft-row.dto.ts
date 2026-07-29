import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Min,
    ValidateNested,
} from 'class-validator';
import { DraftAllocationDto } from './draft-allocation.dto';
import { DATE_ONLY_REGEX } from '../utils/date-only.util';

export const DRAFT_ROW_STATUSES = [
    'ok',
    'warn:opponent-mismatch',
    'warn:multi-ticket-single-pass',
    'error:match-missing',
    'error:opponent-not-found',
    'error:unallocated',
    'error:invalid-cell',
    'error:sold-after-kickoff',
] as const;

export type DraftRowStatus = (typeof DRAFT_ROW_STATUSES)[number];

export class DraftRowDto {
    @IsInt()
    @Min(0)
    rowIndex!: number;

    @IsString()
    @Matches(DATE_ONLY_REGEX)
    date!: string;

    @IsString()
    opponent!: string;

    @IsInt()
    @Min(0)
    listedPrice!: number;

    @IsInt()
    @Min(1)
    nbTickets!: number;

    @IsInt()
    @Min(0)
    invest!: number;

    @IsIn(['PENDING', 'SOLD', 'CANCELLED'])
    status!: 'PENDING' | 'SOLD' | 'CANCELLED';

    @IsOptional()
    @IsString()
    @Matches(DATE_ONLY_REGEX)
    soldAt?: string;

    @IsOptional()
    @IsUUID('4')
    matchId?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DraftAllocationDto)
    allocations!: DraftAllocationDto[];

    @IsIn(DRAFT_ROW_STATUSES)
    rowStatus!: DraftRowStatus;
}
