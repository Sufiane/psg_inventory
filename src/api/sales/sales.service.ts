import { Injectable } from '@nestjs/common';
import { omit } from 'radash';

import type { MatchId, RecipientId, SaleId, UserId } from '@psg/shared/ids';
import type { ListedPrice, Profit } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';
import { RawSaleStatus } from '../accounting/types/accounting-status.type';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { IRecipientsDbService } from '../../db/recipients/recipients.db.interface';
import {
    GiftRecipientInput,
    ISalesDbService,
    SaleAllocationInput,
} from '../../db/sales/sales.db.interface';
import { Sale } from '../../db/sales/type/sale.type';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { PSG_COMMISSION } from '../../shared/constants';
import { normalizeRecipientName } from '../../shared/utils/recipient-name.util';
import {
    getSeasonWindow,
    seasonStartYearFromDate,
} from '../../shared/utils/season.utils';
import { AddSaleDto } from './dto/add-sale.dto';
import { SaleAllocationDto } from './dto/sale-allocation.dto';
import { SaleStatusTarget, UpdateSaleDto } from './dto/update-sale.dto';
import { FormattedSale, ISalesService } from './interfaces/sales.service.interface';
import { IUngiftSaleUsecase } from './usecases/ungift-sale/ungift-sale.usecase';
import { IDeleteSaleUsecase } from './usecases/delete-sale/delete-sale.usecase';

@Injectable()
export class SalesService implements ISalesService {
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly matchesDbService: IMatchesDbService,
        private readonly seasonPassesDbService: ISeasonPassesDbService,
        private readonly recipientsDbService: IRecipientsDbService,
        private readonly redisService: RedisService,
        private readonly ungiftSaleUsecase: IUngiftSaleUsecase,
        private readonly deleteSaleUsecase: IDeleteSaleUsecase,
    ) {}

    async getSale(userId: UserId, saleId: SaleId): Promise<Sale> {
        const sale = await this.salesDbService.getOneSale(userId, saleId);

        if (!sale) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        return sale;
    }

    async getSales(userId: UserId): Promise<FormattedSale[]> {
        const sales = await this.salesDbService.getSales(userId);

        return sales.map((sale) => this.formatSale(sale));
    }

    async getCurrentSeasonSales(userId: UserId): Promise<FormattedSale[]> {
        const { start: from, end: to } = getSeasonWindow(
            seasonStartYearFromDate(new Date()),
            'exclusive',
        );
        const sales = await this.salesDbService.getSalesByRange(userId, { from, to });

        return sales.map((sale) => this.formatSale(sale));
    }

    async getSeasonSales(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<FormattedSale[]> {
        const { start: from, end: to } = getSeasonWindow(seasonStartYear, 'exclusive');
        const sales = await this.salesDbService.getSalesByRange(userId, { from, to });

        return sales.map((sale) => this.formatSale(sale));
    }

    private formatSale(sale: Sale): FormattedSale {
        return {
            ...omit(sale, ['Match', 'userId', 'matchId']),
            opponent: {
                id: sale.Match.Opponent.id,
                name: sale.Match.Opponent.name,
            },
            matchDate: sale.Match.date,
        };
    }

    async addSale(userId: UserId, payload: AddSaleDto): Promise<{ id: SaleId }> {
        await this.validateAllocations(userId, payload.matchId, payload.allocations);

        const sale = await this.salesDbService.addSale({
            userId,
            matchId: payload.matchId,
            listedPrice: payload.listedPrice,
            invest: payload.invest,
            profit: this.getProfit(payload.listedPrice),
            allocations: payload.allocations,
        });

        return { id: sale.id };
    }

    async updateSale(userId: UserId, payload: UpdateSaleDto): Promise<void> {
        const existing = await this.salesDbService.getOneSale(userId, payload.saleId);

        if (!existing) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        const target = payload.status;

        assertLegalTransition(existing.status, target);
        assertNotAfterKickoff(existing, target);

        if (payload.allocations != null) {
            await this.validateAllocations(userId, existing.matchId, payload.allocations);
        }

        const fieldPatch = {
            saleId: payload.saleId,
            userId,
            profit: payload.listedPrice ? this.getProfit(payload.listedPrice) : undefined,
            ...(payload.invest !== undefined ? { invest: payload.invest } : {}),
            ...(payload.listedPrice !== undefined
                ? { listedPrice: payload.listedPrice }
                : {}),
            ...(payload.allocations ? { allocations: payload.allocations } : {}),
        };

        // A recipient sent for an already-GIFTED sale is a gift update whether
        // or not `status` came along: `status` is optional, and an absent one
        // means "leave the status alone", not "this is not a gift write".
        const hasRecipientPayload =
            payload.recipientId != null || payload.recipientName != null;
        const targetsExistingGift =
            existing.status === 'GIFTED' &&
            (target === 'GIFTED' || (target === undefined && hasRecipientPayload));

        // The mirror of the case above: a recipient sent for a sale that is
        // neither gifted nor becoming gifted has nowhere to be written, so it
        // is refused rather than accepted and dropped.
        if (hasRecipientPayload && target !== 'GIFTED' && !targetsExistingGift) {
            throw new DomainException(ErrorCode.SALE_GIFT_RECIPIENT_NOT_APPLICABLE);
        }

        // Three intents, three db methods. Which one runs is decided here, once,
        // from the pair (current status, target status) — and each of them writes
        // the sale and its gift row in a single transaction (spec D15).
        if (target === 'GIFTED' && existing.status !== 'GIFTED') {
            // Entry always moves a gift count — the sale had no gift a moment
            // ago — so the resolved id is not needed to decide anything here.
            await this.salesDbService.giftSale({
                ...fieldPatch,
                recipient: await this.resolveNewGiftRecipient(userId, payload),
            });

            await this.invalidateAfterWrite(userId, { recipientChanged: true });

            return;
        }

        if (targetsExistingGift) {
            const recipient = await this.resolveExistingGiftRecipient(userId, payload);
            const { recipientId } = await this.salesDbService.updateGift({
                ...fieldPatch,
                ...(recipient != null ? { recipient } : {}),
            });

            await this.invalidateAfterWrite(userId, {
                recipientChanged: recipientId !== (existing.Gift?.recipientId ?? null),
            });

            return;
        }

        await this.salesDbService.updateSale({
            ...fieldPatch,
            ...(target !== undefined ? { status: target as 'PENDING' | 'SOLD' } : {}),
        });

        await this.invalidateAfterWrite(userId, { recipientChanged: false });
    }

    getProfit(price: ListedPrice): Profit {
        return ((price * (100 - PSG_COMMISSION)) / 100) as Profit;
    }

    // Entry into GIFTED. A recipient is mandatory (spec D9): the combobox always
    // sends one, and an empty submit is a user error, not a gift with no name.
    private async resolveNewGiftRecipient(
        userId: UserId,
        payload: UpdateSaleDto,
    ): Promise<GiftRecipientInput> {
        if (payload.recipientId != null) {
            return {
                recipientId: await this.assertOwnedRecipient(userId, payload.recipientId),
            };
        }

        const name = normalizeRecipientName(payload.recipientName ?? '');

        if (name.length === 0) {
            throw new DomainException(ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED);
        }

        return { recipientName: name };
    }

    // A sale that is already GIFTED. `undefined` means "leave the recipient
    // alone" — the genuine no-op of an unrelated-field edit that resubmits the
    // unchanged status (spec D9). Every gift now has a recipient, so a blank
    // name here can only mean "keep the current one" — there is no longer a
    // recipient-less state that would make a blank name an error.
    private async resolveExistingGiftRecipient(
        userId: UserId,
        payload: UpdateSaleDto,
    ): Promise<GiftRecipientInput | undefined> {
        if (payload.recipientId != null) {
            return {
                recipientId: await this.assertOwnedRecipient(userId, payload.recipientId),
            };
        }

        const name = normalizeRecipientName(payload.recipientName ?? '');

        if (name.length === 0) {
            return undefined;
        }

        return { recipientName: name };
    }

    private async assertOwnedRecipient(
        userId: UserId,
        recipientId: RecipientId,
    ): Promise<RecipientId> {
        const owned = await this.recipientsDbService.findByIdForUser(recipientId, userId);

        if (owned == null) {
            throw new DomainException(ErrorCode.SALE_GIFT_RECIPIENT_NOT_FOUND);
        }

        return owned.id;
    }

    private async invalidateAfterWrite(
        userId: UserId,
        options: { recipientChanged: boolean },
    ): Promise<void> {
        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );

        // The combobox orders by giftCount, which only moves when a gift is
        // created, retargeted or destroyed.
        if (options.recipientChanged) {
            await this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        }
    }

    async ungiftSale(userId: UserId, saleId: SaleId): Promise<void> {
        return this.ungiftSaleUsecase.execute(userId, saleId);
    }

    async deleteSale(userId: UserId, saleId: SaleId): Promise<void> {
        return this.deleteSaleUsecase.execute(userId, saleId);
    }

    private async validateAllocations(
        userId: UserId,
        matchId: MatchId,
        allocations: SaleAllocationDto[] | SaleAllocationInput[],
    ): Promise<void> {
        if (allocations.length === 0) {
            throw new DomainException(ErrorCode.SALE_INVALID_ALLOCATIONS);
        }

        const seen = new Set<string>();

        for (const allocation of allocations) {
            if (seen.has(allocation.seasonPassId)) {
                throw new DomainException(ErrorCode.SALE_INVALID_ALLOCATIONS);
            }

            seen.add(allocation.seasonPassId);
        }

        const match = await this.matchesDbService.getOneMatch(matchId);

        if (match == null) {
            throw new DomainException(ErrorCode.MATCH_NOT_FOUND);
        }

        const matchSeason = seasonStartYearFromDate(match.date);

        for (const allocation of allocations) {
            const pass = await this.seasonPassesDbService.findById(
                allocation.seasonPassId,
            );

            if (pass == null || pass.userId !== userId) {
                throw new DomainException(ErrorCode.SALE_ALLOCATION_PASS_MISMATCH);
            }

            if (pass.seasonStartYear !== matchSeason) {
                throw new DomainException(ErrorCode.SALE_ALLOCATION_PASS_MISMATCH);
            }
        }
    }
}

// The legal manual transitions, per docs/specs/2026-09-11-gifted-sale-status-design.md
// D5 (revised 2026-09-12). GIFTED is reachable only from PENDING and is
// terminal: there is no in-app undo of the status, a mistake needs a
// database-level fix. CANCELLED is absent as a target because it is cron-owned
// and UpdateSaleDto does not accept it (D4). Same-status entries are the no-op
// resubmits every form on the sales page can produce.
const LEGAL_TRANSITIONS: Record<RawSaleStatus, SaleStatusTarget[]> = {
    PENDING: ['PENDING', 'SOLD', 'GIFTED'],
    SOLD: ['PENDING', 'SOLD'],
    CANCELLED: ['PENDING', 'SOLD'],
    GIFTED: ['GIFTED'],
};

function isLegalTransition(current: RawSaleStatus, target: SaleStatusTarget): boolean {
    return LEGAL_TRANSITIONS[current].includes(target);
}

// In updateSale, this runs before assertNotAfterKickoff. An illegal move is
// refused before the kickoff guard runs, so a SOLD -> GIFTED on a played
// match reports the transition, not the kickoff.
function assertLegalTransition(
    current: RawSaleStatus,
    target: SaleStatusTarget | undefined,
): void {
    if (target !== undefined && !isLegalTransition(current, target)) {
        throw new DomainException(ErrorCode.SALE_INVALID_STATUS_TRANSITION);
    }
}

function assertNotAfterKickoff(
    existing: Sale,
    target: SaleStatusTarget | undefined,
): void {
    if (
        target !== undefined &&
        isKickoffGuarded(existing.status, target) &&
        existing.Match.date.getTime() <= Date.now()
    ) {
        throw new DomainException(ErrorCode.SALE_AFTER_KICKOFF);
    }
}

// Selling and giving a ticket away are both decisions taken before the match,
// so entering either state after kickoff is refused. GIFTED -> GIFTED is NOT
// entry: it moves no status, and correcting who received a gift is not a
// decision that has to precede the match, so it is deliberately exempt
// (spec D5/D10 — guarding on the target alone breaks that exemption).
function isKickoffGuarded(current: RawSaleStatus, target: SaleStatusTarget): boolean {
    if (target === 'SOLD') {
        return true;
    }

    return target === 'GIFTED' && current !== 'GIFTED';
}
