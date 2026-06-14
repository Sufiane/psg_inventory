import { SeasonPasses } from '@prisma/client';
import type { Override } from '@psg/shared/brand';
import type { SeasonPassId, UserId } from '@psg/shared/ids';

export type SeasonPass = Override<SeasonPasses, { id: SeasonPassId; userId: UserId }>;
