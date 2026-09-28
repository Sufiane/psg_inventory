import { SeasonPasses } from '@prisma/client';
import type { Override } from '@psg/shared/brand';
import type { SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonPassPrice } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';

export type SeasonPass = Override<
    SeasonPasses,
    {
        id: SeasonPassId;
        userId: UserId;
        seasonStartYear: SeasonYear;
        price: SeasonPassPrice;
    }
>;
