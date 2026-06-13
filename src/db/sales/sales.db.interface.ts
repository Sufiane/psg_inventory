import { SaleStatus } from '@prisma/client';
import type { MatchId, SaleId, SeasonPassId, UserId } from '@psg/shared';
import { Sale } from './type/sale.type';
import { SaleWithFullMatch } from './type/sale-with-full-match.type';
import { OldestMatchSale } from './type/oldest-match-sale.type';

export type SaleAllocationInput = {
    seasonPassId: SeasonPassId;
    nbTickets: number;
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
        profit: number;
        invest: number;
        matchId: MatchId;
        listedPrice: number;
        allocations: SaleAllocationInput[];
    }): Promise<{ id: SaleId }>;
    abstract updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: number | undefined;
        invest?: number;
        listedPrice?: number;
        sold?: boolean;
        status?: SaleStatus;
        allocations?: SaleAllocationInput[];
    }): Promise<void>;
    abstract deleteSale(userId: UserId, saleId: SaleId): Promise<void>;
    abstract getOneByWithFullMatch(query: {
        profit?: number;
        listedPrice?: number;
        invest?: number;
        nbTickets?: number;
        status?: SaleStatus;
    }): Promise<SaleWithFullMatch>;
    abstract cancelMany(): Promise<void>;
    abstract getOldestMatchSale(userId: UserId): Promise<OldestMatchSale>;
}
