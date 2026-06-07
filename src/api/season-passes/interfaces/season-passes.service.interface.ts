import { SeasonPass } from '../../../db/season-passes/type/season-pass.type';
import { CreateSeasonPassDto } from '../dto/create-season-pass.dto';
import { UpdateSeasonPassDto } from '../dto/update-season-pass.dto';

export abstract class ISeasonPassesService {
    abstract findCurrentSeason(userId: string): Promise<SeasonPass[]>;
    abstract findBySeason(userId: string, seasonStartYear: number): Promise<SeasonPass[]>;
    abstract findAll(userId: string): Promise<SeasonPass[]>;
    abstract findOne(userId: string, passId: string): Promise<SeasonPass>;
    abstract create(userId: string, payload: CreateSeasonPassDto): Promise<SeasonPass>;
    abstract update(
        userId: string,
        passId: string,
        payload: UpdateSeasonPassDto,
    ): Promise<SeasonPass>;
    abstract remove(userId: string, passId: string): Promise<void>;
}
