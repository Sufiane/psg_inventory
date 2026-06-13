import type { OpponentId, SaleId, SeasonYear, UserId } from '@psg/shared';
import { Sale } from '../../../db/sales/type/sale.type';
import { AddSaleDto } from '../dto/add-sale.dto';
import { UpdateSaleDto } from '../dto/update-sale.dto';

export type FormattedSale = Omit<Sale, 'Match' | 'userId' | 'matchId'> & {
    opponent: { id: OpponentId; name: string };
    matchDate: Date;
};

export abstract class ISalesService {
    abstract getSale(userId: UserId, saleId: SaleId): Promise<Sale>;
    abstract getSales(userId: UserId): Promise<FormattedSale[]>;
    abstract getCurrentSeasonSales(userId: UserId): Promise<FormattedSale[]>;
    abstract getSeasonSales(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<FormattedSale[]>;
    abstract addSale(userId: UserId, payload: AddSaleDto): Promise<{ id: SaleId }>;
    abstract updateSale(userId: UserId, payload: UpdateSaleDto): Promise<void>;
    abstract getProfit(price: number): number;
    abstract deleteSale(userId: UserId, saleId: SaleId): Promise<void>;
}
