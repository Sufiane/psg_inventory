import { IsUUID } from 'class-validator';
import type { SeasonPassId } from '@psg/shared/ids';

export class GetSeasonPassDto {
    @IsUUID()
    passId: SeasonPassId;
}
