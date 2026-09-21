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
    abstract getSalesGrouped(userId: UserId): Promise<SalesGroup>;
    abstract addSale(payload: {
        userId: UserId;
        profit: Profit;
        invest: Invest;
        matchId: MatchId;
        listedPrice: ListedPrice;
        allocations: SaleAllocationInput[];
    }): Promise<{ id: SaleId }>;

    // Ordinary field and status edits. `status` deliberately cannot express
    // GIFTED: entering, changing and leaving that state is the exclusive
    // business of giftSale / updateGift / ungiftSale, each of which writes the
    // status and the gift row in one transaction (spec D15, layer 2). Widening
    // this back to `SaleStatus` reopens the exact hole this redesign closed.
    abstract updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        status?: 'PENDING' | 'SOLD';
        allocations?: SaleAllocationInput[];
    }): Promise<void>;

    // PENDING -> GIFTED. Sets the status and inserts the gift row in one
    // transaction, in that order — the composite foreign key rejects the
    // reverse order outright.
    abstract giftSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
    }): Promise<{ recipientId: RecipientId }>;

    // GIFTED -> GIFTED. Attaches, corrects or reuses the recipient on an
    // existing gift row. Writes no status at all. `recipient` omitted is the
    // deliberate no-op of spec D9.
    //
    // Assumes the gift row exists, which is true for every sale this method
    // can reach through the app (only giftSale creates a GIFTED sale, and it
    // always writes the gift row in the same transaction — see the Gifts
    // model comment in schema.prisma). That assumption is not database-
    // enforced in this direction by design (spec D15's rejected trigger
    // alternative); a row bypassing the app write paths could in principle
    // violate it, in which case the no-recipient read uses `findUniqueOrThrow`
    // and the recipient-supplied write uses `gifts.update` — a bypassed-write-
    // path row raises Prisma's P2025 from *both* branches rather than
    // silently returning `null` from one.
    abstract updateGift(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient?: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
    }): Promise<{ recipientId: RecipientId }>;

    // The sanctioned manual repair (spec D16). No controller reaches it:
    // GIFTED is terminal in the app (spec D5). Deletes the gift row and flips
    // the status back to PENDING in one transaction, never one without the
    // other.
    abstract ungiftSale(userId: UserId, saleId: SaleId): Promise<void>;

    abstract deleteSale(userId: UserId, saleId: SaleId): Promise<void>;
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
