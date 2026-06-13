import { Prisma } from '.prisma/client';
import type { Override } from '@psg/shared';
import type {
    MatchId,
    MatchResultId,
    MatchScore,
    OpponentId,
    OpponentName,
} from '@psg/shared';
import { MatchesService } from '../matches.service';

type MatchRow = Prisma.MatchesGetPayload<ReturnType<typeof MatchesService.matchQuery>>;

export type Match = Override<
    MatchRow,
    {
        id: MatchId;
        opponentId: OpponentId;
        Opponent: Override<MatchRow['Opponent'], { id: OpponentId; name: OpponentName }>;
        MatchResults: MatchRow['MatchResults'] extends infer R
            ? R extends null
                ? null
                : R extends object
                  ? Override<
                        R,
                        { id: MatchResultId; matchId: MatchId; score: MatchScore }
                    >
                  : R
            : never;
    }
>;
