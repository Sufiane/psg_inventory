import { Matches, Opponents, Sales } from '@prisma/client';
import type { Override } from '@psg/shared';
import type {
    Invest,
    ListedPrice,
    MatchId,
    MatchResultId,
    MatchScore,
    OpponentId,
    OpponentName,
    Profit,
    SaleId,
    UserId,
} from '@psg/shared';

type Row = Sales & { Match: Matches & { Opponent: Opponents } };

export type SaleWithFullMatch = Override<
    Row,
    {
        id: SaleId;
        userId: UserId;
        matchId: MatchId;
        invest: Invest;
        profit: Profit;
        listedPrice: ListedPrice;
        Match: Override<
            Row['Match'],
            {
                id: MatchId;
                opponentId: OpponentId;
                Opponent: Override<
                    Row['Match']['Opponent'],
                    { id: OpponentId; name: OpponentName }
                >;
            }
        > & { MatchResults?: { id: MatchResultId; score: MatchScore } };
    }
>;
