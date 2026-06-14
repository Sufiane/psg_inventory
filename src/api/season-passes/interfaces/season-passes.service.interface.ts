import type { SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { SeasonPass } from '../../../db/season-passes/type/season-pass.type';
import { CreateSeasonPassDto } from '../dto/create-season-pass.dto';
import { UpdateSeasonPassDto } from '../dto/update-season-pass.dto';

export abstract class ISeasonPassesService {
    abstract findCurrentSeason(userId: UserId): Promise<SeasonPass[]>;
    abstract findBySeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<SeasonPass[]>;
    abstract findAll(userId: UserId): Promise<SeasonPass[]>;
    abstract findOne(userId: UserId, passId: SeasonPassId): Promise<SeasonPass>;
    abstract create(userId: UserId, payload: CreateSeasonPassDto): Promise<SeasonPass>;
    abstract update(
        userId: UserId,
        passId: SeasonPassId,
        payload: UpdateSeasonPassDto,
    ): Promise<SeasonPass>;
    abstract remove(userId: UserId, passId: SeasonPassId): Promise<void>;
}
