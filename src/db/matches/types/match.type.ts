import { Prisma } from '.prisma/client';
import { MatchesService } from '../matches.service';

export type Match = Prisma.MatchesGetPayload<
    ReturnType<typeof MatchesService.matchQuery>
>;
