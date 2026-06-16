import { Prisma } from '.prisma/client';
import type { Override } from '@psg/shared/brand';
import type { MatchId, MatchResultId, OpponentId } from '@psg/shared/ids';
import type { MatchScore, OpponentName } from '@psg/shared/strings';
import { matchQuery } from '../matches.query';

type MatchRow = Prisma.MatchesGetPayload<ReturnType<typeof matchQuery>>;

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
