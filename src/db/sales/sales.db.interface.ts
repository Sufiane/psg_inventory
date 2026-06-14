import { SaleStatus } from '@prisma/client';
import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, SaleId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import { Sale } from './type/sale.type';
import { SaleWithFullMatch } from './type/sale-with-full-match.type';
import { OldestMatchSale } from './type/oldest-match-sale.type';

export type SaleAllocationInput = {
    seasonPassId: SeasonPassId;
    nbTickets: TicketCount;
};

export abstract class ISalesDbService {
    abstract getOneSale(userId: UserId, saleId: SaleId): Promise<Sale | null>;
    abstract getSales(userId: UserId): Promise<Sale[]>;
    abstract getSalesByRange(
        userId: UserId,
        range: { from: Date; to: Date },
    ): Promise<Sale[]>;
    abstract addSale(payload: {
        userId: UserId;
        profit: Profit;
        invest: Invest;
        matchId: MatchId;
        listedPrice: ListedPrice;
        allocations: SaleAllocationInput[];
    }): Promise<{ id: SaleId }>;
    abstract updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        sold?: boolean;
        status?: SaleStatus;
        allocations?: SaleAllocationInput[];
    }): Promise<void>;
    abstract deleteSale(userId: UserId, saleId: SaleId): Promise<void>;
    abstract getOneByWithFullMatch(query: {
        profit?: Profit;
        listedPrice?: ListedPrice;
        invest?: Invest;
        nbTickets?: TicketCount;
        status?: SaleStatus;
    }): Promise<SaleWithFullMatch>;
    abstract cancelMany(): Promise<void>;
    abstract getOldestMatchSale(userId: UserId): Promise<OldestMatchSale>;
}
