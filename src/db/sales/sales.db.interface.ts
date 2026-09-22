import { SaleStatus } from '@prisma/client';
import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, RecipientId, SaleId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import { Sale, SalesGroup } from './type/sale.type';
import { SaleWithFullMatch } from './type/sale-with-full-match.type';
import { OldestMatchSale } from './type/oldest-match-sale.type';

export type SaleAllocationInput = {
    seasonPassId: SeasonPassId;
    nbTickets: TicketCount;
};

// A gift's recipient arrives either already resolved (an id the api layer
// validated as the user's own) or as a name to resolve-or-create. The name is
// resolved on the *same* transaction as the sale write, so a failed write
// cannot leave an orphaned recipient behind (spec D8).
export type GiftRecipientInput = { recipientId: RecipientId } | { recipientName: string };

export abstract class ISalesDbService {
    abstract getOneSale(userId: UserId, saleId: SaleId): Promise<Sale | null>;
    abstract getSales(userId: UserId): Promise<Sale[]>;
    abstract getSalesByRange(
        userId: UserId,
        range: { from: Date; to: Date },
    ): Promise<Sale[]>;
    abstract getSalesGrouped(
        userId: UserId,
        range: { from: Date; to: Date },
    ): Promise<SalesGroup>;
    abstract addSale(payload: {
        userId: UserId;
        profit: Profit;
        invest: Invest;
        matchId: MatchId;
        listedPrice: ListedPrice;
        allocations: SaleAllocationInput[];
    }): Promise<{ id: SaleId }>;

    abstract getSalesByMatch(userId: UserId, matchId: MatchId): Promise<Sale[]>;

    abstract getOneByWithFullMatch(query: {
        profit?: Profit;
        listedPrice?: ListedPrice;
        invest?: Invest;
        nbTickets?: TicketCount;
        statuses?: SaleStatus[];
        userId: UserId;
        matchDateFrom: Date;
        matchDateTo?: Date;
    }): Promise<SaleWithFullMatch>;
    abstract cancelMany(): Promise<void>;
    abstract getOldestMatchSale(userId: UserId): Promise<OldestMatchSale>;
}
