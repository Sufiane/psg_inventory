import { Matches, Opponents, Sales } from '@prisma/client';
import type { Override } from '@psg/shared/brand';
import type { MatchId, MatchResultId, OpponentId, SaleId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import type { MatchScore, OpponentName } from '@psg/shared/strings';

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
