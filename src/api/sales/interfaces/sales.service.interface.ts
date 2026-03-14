import { Sale } from '../../../db/sales/type/sale.type';
import { AddSaleDto } from '../dto/add-sale.dto';
import { UpdateSaleDto } from '../dto/update-sale.dto';

export abstract class ISalesService {
    abstract getSale(userId: string, saleId: string): Promise<Sale | null>;
    abstract getSales(
        userId: string,
    ): Promise<
        Array<
            Omit<Sale, 'Match' | 'userId' | 'matchId'> & {
                opponent: { id: string; name: string };
            }
        >
    >;
    abstract addSale(userId: string, payload: AddSaleDto): Promise<{ id: string }>;
    abstract updateSale(userId: string, payload: UpdateSaleDto): Promise<void>;
    abstract getProfit(price: number): number;
    abstract deleteSale(userId: string, saleId: string): Promise<void>;
}
