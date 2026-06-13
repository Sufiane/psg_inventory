import { IsUUID } from 'class-validator';
import type { SeasonPassId } from '@psg/shared';

export class GetSeasonPassDto {
    @IsUUID()
    passId: SeasonPassId;
}
