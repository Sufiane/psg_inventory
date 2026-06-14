import type { SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonPassPrice } from '@psg/shared/money';
import type { CategoryLabel, PassLabel, RowLabel, SeatLabel } from '@psg/shared/strings';
import type { SeasonYear } from '@psg/shared/time';
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
