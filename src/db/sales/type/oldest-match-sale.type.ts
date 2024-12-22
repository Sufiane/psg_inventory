import { Matches, Sales } from '@prisma/client';

export type OldestMatchSale = Sales & { Match: Matches };
