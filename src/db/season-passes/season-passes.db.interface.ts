import type {
    CategoryLabel,
    PassLabel,
    RowLabel,
    SeasonPassId,
    SeasonPassPrice,
    SeasonYear,
    SeatLabel,
    UserId,
} from '@psg/shared';
import { SeasonPass } from './type/season-pass.type';

export type CreateSeasonPassInput = {
    userId: UserId;
    seasonStartYear: SeasonYear;
    price: SeasonPassPrice;
    label: PassLabel;
    category: CategoryLabel;
    row: RowLabel;
    seat: SeatLabel;
};

export type UpdateSeasonPassInput = {
    price: SeasonPassPrice;
    label: PassLabel;
    category: CategoryLabel;
    row: RowLabel;
    seat: SeatLabel;
};

export abstract class ISeasonPassesDbService {
    abstract findById(id: SeasonPassId): Promise<SeasonPass | null>;
    abstract findBySeason(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<SeasonPass[]>;
    abstract findAll(userId: UserId): Promise<SeasonPass[]>;
    abstract create(payload: CreateSeasonPassInput): Promise<SeasonPass>;
    abstract update(
        id: SeasonPassId,
        payload: UpdateSeasonPassInput,
    ): Promise<SeasonPass>;
    abstract remove(id: SeasonPassId): Promise<void>;
    abstract countAllocations(seasonPassId: SeasonPassId): Promise<number>;
}
