import type { SeasonPassId, UserId } from '@psg/shared';
import { SeasonPass } from './type/season-pass.type';

export type CreateSeasonPassInput = {
    userId: UserId;
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
    abstract findById(id: SeasonPassId): Promise<SeasonPass | null>;
    abstract findBySeason(userId: UserId, seasonStartYear: number): Promise<SeasonPass[]>;
    abstract findAll(userId: UserId): Promise<SeasonPass[]>;
    abstract create(payload: CreateSeasonPassInput): Promise<SeasonPass>;
    abstract update(
        id: SeasonPassId,
        payload: UpdateSeasonPassInput,
    ): Promise<SeasonPass>;
    abstract remove(id: SeasonPassId): Promise<void>;
    abstract countAllocations(seasonPassId: SeasonPassId): Promise<number>;
}
