import { SaleStatus } from '@prisma/client';
import { Sale } from './type/sale.type';
import { SaleWithFullMatch } from './type/sale-with-full-match.type';
import { OldestMatchSale } from './type/oldest-match-sale.type';

export type SaleAllocationInput = {
    seasonPassId: string;
    nbTickets: number;
};

export abstract class ISalesDbService {
    abstract getOneSale(userId: string, saleId: string): Promise<Sale | null>;
    abstract getSales(userId: string): Promise<Sale[]>;
    abstract getSalesByRange(
        userId: string,
        range: { from: Date; to: Date },
    ): Promise<Sale[]>;
    abstract addSale(payload: {
        userId: string;
        profit: number;
        invest: number;
        matchId: string;
        listedPrice: number;
        allocations: SaleAllocationInput[];
    }): Promise<{ id: string }>;
    abstract updateSale(payload: {
        saleId: string;
        userId: string;
        profit: number | undefined;
        invest?: number;
        listedPrice?: number;
        sold?: boolean;
        status?: SaleStatus;
        allocations?: SaleAllocationInput[];
    }): Promise<void>;
    abstract deleteSale(userId: string, saleId: string): Promise<void>;
    abstract getOneByWithFullMatch(query: {
        profit?: number;
        listedPrice?: number;
        invest?: number;
        nbTickets?: number;
        status?: SaleStatus;
    }): Promise<SaleWithFullMatch>;
    abstract cancelMany(): Promise<void>;
    abstract getOldestMatchSale(userId: string): Promise<OldestMatchSale>;
}
