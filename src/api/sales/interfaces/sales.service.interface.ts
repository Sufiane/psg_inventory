import type { OpponentId, SaleId, UserId } from '@psg/shared/ids';
import type { ListedPrice, Profit } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';
import { Sale } from '../../../db/sales/type/sale.type';
import { AddSaleDto } from '../dto/add-sale.dto';
import { UpdateSaleDto } from '../dto/update-sale.dto';

// The wire shape is the stored shape: a sale carries its gift as the joined
// `Gift` row, null when it has none.
export type FormattedSale = Omit<Sale, 'Match' | 'userId' | 'matchId'> & {
    opponent: { id: OpponentId; name: string };
    matchDate: Date;
};

export type FormattedSalesGroup = {
    pending: FormattedSale[];
    terminal: FormattedSale[];
};

export abstract class ISalesService {
    abstract getSale(userId: UserId, saleId: SaleId): Promise<Sale>;
    abstract getSales(userId: UserId): Promise<FormattedSale[]>;
    abstract getCurrentSeasonSales(userId: UserId): Promise<FormattedSale[]>;
    abstract getSalesGrouped(userId: UserId): Promise<FormattedSalesGroup>;
    abstract getSeasonSales(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<FormattedSale[]>;
    abstract addSale(userId: UserId, payload: AddSaleDto): Promise<{ id: SaleId }>;
    abstract updateSale(userId: UserId, payload: UpdateSaleDto): Promise<void>;
    abstract getProfit(price: ListedPrice): Profit;
    abstract deleteSale(userId: UserId, saleId: SaleId): Promise<void>;
    // Manual repair for a sale gifted by mistake — not exposed by the
    // controller, since GIFTED is terminal in the app (spec D5/D16).
    abstract ungiftSale(userId: UserId, saleId: SaleId): Promise<void>;
}
