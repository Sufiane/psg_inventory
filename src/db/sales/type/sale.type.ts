import { Prisma } from '@prisma/client';
import type { Override } from '@psg/shared/brand';
import type {
    MatchId,
    OpponentId,
    SaleId,
    SalePassAllocationId,
    SeasonPassId,
    UserId,
} from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import type { OpponentName } from '@psg/shared/strings';
import { saleQuery } from '../sales.query';

type SaleRow = Prisma.SalesGetPayload<typeof saleQuery>;

export type Sale = Override<
    SaleRow,
    {
        id: SaleId;
        userId: UserId;
        matchId: MatchId;
        invest: Invest;
        profit: Profit;
        listedPrice: ListedPrice;
        Match: Override<
            SaleRow['Match'],
            {
                Opponent: Override<
                    SaleRow['Match']['Opponent'],
                    { id: OpponentId; name: OpponentName }
                >;
            }
        >;
        Allocations: Array<
            Override<
                SaleRow['Allocations'][number],
                { id: SalePassAllocationId; seasonPassId: SeasonPassId }
            >
        >;
    }
>;
