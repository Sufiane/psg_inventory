import type { OpponentId, RecipientId, SaleId, UserId } from '@psg/shared/ids';
import type { ListedPrice, Profit } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';
import { Sale } from '../../../db/sales/type/sale.type';
import { AddSaleDto } from '../dto/add-sale.dto';
import { UpdateSaleDto } from '../dto/update-sale.dto';

// The wire shape. Giftedness is stored as its own row (spec D14) but is served
// flattened onto the sale — `giftedAt` and `Recipient` at the top level, exactly
// as before the gift table existed. That is what keeps `web/` untouched and lets
// the api deploy without a matching web deploy (spec D17).
export type SaleResponse = Omit<Sale, 'Gift'> & {
    giftedAt: Date | null;
    Recipient: { id: RecipientId; name: string } | null;
};

export type FormattedSale = Omit<SaleResponse, 'Match' | 'userId' | 'matchId'> & {
    opponent: { id: OpponentId; name: string };
    matchDate: Date;
};

export abstract class ISalesService {
    abstract getSale(userId: UserId, saleId: SaleId): Promise<SaleResponse>;
    abstract getSales(userId: UserId): Promise<FormattedSale[]>;
    abstract getCurrentSeasonSales(userId: UserId): Promise<FormattedSale[]>;
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
