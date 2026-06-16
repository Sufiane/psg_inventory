import type { SeasonPassId, UserId } from '@psg/shared/ids';

// Api-owned representation of a season pass. The db layer has its own
// row type derived from Prisma; the api boundary returns this one so
// downstream consumers (controllers, redis keys) never reach into the
// db package.
export type SeasonPass = {
    id: SeasonPassId;
    userId: UserId;
    seasonStartYear: number;
    price: number;
    label: string;
    category: string;
    row: string;
    seat: string;
    createdAt: Date;
    updatedAt: Date;
};
