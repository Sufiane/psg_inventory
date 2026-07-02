import { SaleStatus } from '@prisma/client';
import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';

export type BulkSaleAllocationInput = {
    seasonPassId: SeasonPassId;
    nbTickets: TicketCount;
};

export type BulkSaleInput = {
    matchId: MatchId;
    listedPrice: ListedPrice;
    invest: Invest;
    profit: Profit;
    nbTickets: TicketCount;
    status: SaleStatus;
    allocations: BulkSaleAllocationInput[];
};

export abstract class ISalesImportDbService {
    abstract bulkCreate(payload: {
        userId: UserId;
        batchId: string;
        sales: BulkSaleInput[];
    }): Promise<number>;

    abstract deleteBatch(userId: UserId, batchId: string): Promise<number>;
}
