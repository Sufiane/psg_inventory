import { SeasonPasses } from '@prisma/client';
import type { Override } from '@psg/shared';
import type { SeasonPassId, UserId } from '@psg/shared';

export type SeasonPass = Override<SeasonPasses, { id: SeasonPassId; userId: UserId }>;
