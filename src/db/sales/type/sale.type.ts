import { Prisma } from '@prisma/client';
import type { Override } from '@psg/shared';
import type {
    MatchId,
    OpponentId,
    OpponentName,
    SaleId,
    SalePassAllocationId,
    SeasonPassId,
    UserId,
} from '@psg/shared';
import { SalesService } from '../sales.service';

type SaleRow = Prisma.SalesGetPayload<typeof SalesService.saleQuery>;

export type Sale = Override<
    SaleRow,
    {
        id: SaleId;
        userId: UserId;
        matchId: MatchId;
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
