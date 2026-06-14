import { Matches, Sales } from '@prisma/client';
import type { Override } from '@psg/shared/brand';
import type { MatchId, OpponentId, SaleId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';

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
