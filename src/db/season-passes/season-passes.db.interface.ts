import { SeasonPass } from './type/season-pass.type';

export type CreateSeasonPassInput = {
    userId: string;
    seasonStartYear: number;
    price: number;
    label: string;
    category: string;
    row: string;
    seat: string;
};

export type UpdateSeasonPassInput = {
    price: number;
    label: string;
    category: string;
    row: string;
    seat: string;
};

export abstract class ISeasonPassesDbService {
    abstract findById(id: string): Promise<SeasonPass | null>;
    abstract findBySeason(userId: string, seasonStartYear: number): Promise<SeasonPass[]>;
    abstract findAll(userId: string): Promise<SeasonPass[]>;
    abstract create(payload: CreateSeasonPassInput): Promise<SeasonPass>;
    abstract update(id: string, payload: UpdateSeasonPassInput): Promise<SeasonPass>;
    abstract remove(id: string): Promise<void>;
    abstract countAllocations(seasonPassId: string): Promise<number>;
}
