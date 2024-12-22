import { Matches, Opponents, Sales } from '@prisma/client';

export type SaleWithFullMatch = Sales & { Match: Matches & { Opponent: Opponents } };
