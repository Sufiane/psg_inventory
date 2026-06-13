import { Matches, Sales } from '@prisma/client';
import type { Override } from '@psg/shared';
import type {
    Invest,
    ListedPrice,
    MatchId,
    OpponentId,
    Profit,
    SaleId,
    UserId,
} from '@psg/shared';

type Row = Sales & { Match: Matches };

export type OldestMatchSale = Override<
    Row,
    {
        id: SaleId;
        userId: UserId;
        matchId: MatchId;
        invest: Invest;
        profit: Profit;
        listedPrice: ListedPrice;
        Match: Override<Row['Match'], { id: MatchId; opponentId: OpponentId }>;
    }
>;
