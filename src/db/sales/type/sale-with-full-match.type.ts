import { Matches, Opponents, Sales } from '@prisma/client';
import type { Override } from '@psg/shared';
import type { MatchId, MatchResultId, OpponentId, SaleId, UserId } from '@psg/shared';

type Row = Sales & { Match: Matches & { Opponent: Opponents } };

export type SaleWithFullMatch = Override<
    Row,
    {
        id: SaleId;
        userId: UserId;
        matchId: MatchId;
        Match: Override<
            Row['Match'],
            {
                id: MatchId;
                opponentId: OpponentId;
                Opponent: Override<Row['Match']['Opponent'], { id: OpponentId }>;
            }
        > & { MatchResults?: { id: MatchResultId } };
    }
>;
