import { SeasonPass } from './type/season-pass.type';

export type UpsertSeasonPassInput = {
    userId: string;
    seasonStartYear: number;
    price: number;
    category?: string | null;
    row?: string | null;
    seat?: string | null;
};

export abstract class ISeasonPassesDbService {
    abstract findBySeason(
        userId: string,
        seasonStartYear: number,
    ): Promise<SeasonPass | null>;
    abstract findAll(userId: string): Promise<SeasonPass[]>;
    abstract upsert(payload: UpsertSeasonPassInput): Promise<SeasonPass>;
    abstract remove(userId: string, seasonStartYear: number): Promise<void>;
}
