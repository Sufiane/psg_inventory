import { SeasonPass } from '../../../db/season-passes/type/season-pass.type';
import { UpsertSeasonPassDto } from '../dto/upsert-season-pass.dto';

export abstract class ISeasonPassesService {
    abstract findCurrentSeason(userId: string): Promise<SeasonPass | null>;
    abstract findBySeason(
        userId: string,
        seasonStartYear: number,
    ): Promise<SeasonPass | null>;
    abstract findAll(userId: string): Promise<SeasonPass[]>;
    abstract upsert(
        userId: string,
        seasonStartYear: number,
        payload: UpsertSeasonPassDto,
    ): Promise<SeasonPass>;
    abstract remove(userId: string, seasonStartYear: number): Promise<void>;
}
