import type { SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonPassPrice } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';

// Api-owned representation of a season pass. The db layer has its own
// row type derived from Prisma; the api boundary returns this one so
// downstream consumers (controllers, redis keys) never reach into the
// db package.
// Numeric fields carry the same brands as the db row (PSG-40), so the
// service pass-throughs are type-exact.
export type SeasonPass = {
    id: SeasonPassId;
    userId: UserId;
    seasonStartYear: SeasonYear;
    price: SeasonPassPrice;
    label: string;
    category: string;
    row: string;
    seat: string;
    createdAt: Date;
    updatedAt: Date;
};
