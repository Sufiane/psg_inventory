import type { SaleStatus } from '@prisma/client';

import { Sale } from '../../../db/sales/type/sale.type';
import { SeasonPass } from '../../../db/season-passes/type/season-pass.type';
import { Match } from '../../../db/matches/types/match.type';
import type { MatchId, RecipientId, SaleId, SeasonPassId, UserId } from '@psg/shared/ids';

export const userId = 'user-uuid' as UserId;
export const saleId = 'sale-uuid' as SaleId;
export const matchId = 'match-uuid' as MatchId;
export const passId = 'pass-uuid' as SeasonPassId;

export function saleFixture(
    matchDate: Date,
    status: SaleStatus = 'PENDING' as SaleStatus,
    gift: Sale['Gift'] = null,
): Sale {
    return {
        id: saleId,
        userId,
        matchId,
        listedPrice: 100,
        profit: 90,
        invest: 50,
        nbTickets: 1,
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
        soldAt: null,
        cancelledAt: null,
        Gift: gift,
        Match: {
            date: matchDate,
            Opponent: { id: 'opp', name: 'Marseille' },
        },
        Allocations: [],
    } as unknown as Sale;
}

export function giftFixture(
    overrides: Partial<{
        giftedAt: Date;
        recipientId: RecipientId;
        Recipient: { id: RecipientId; name: string };
    }> = {},
): NonNullable<Sale['Gift']> {
    return {
        giftedAt: new Date('2026-03-01T12:00:00.000Z'),
        recipientId: 'r9' as RecipientId,
        Recipient: { id: 'r9' as RecipientId, name: 'Marc' },
        ...overrides,
    } as NonNullable<Sale['Gift']>;
}

export function matchFixture(date: Date): Match {
    return {
        id: matchId,
        date,
        atHome: true,
        competition: 'CHAMPIONSHIP',
    } as unknown as Match;
}

export function passFixture(overrides: Partial<SeasonPass> = {}): SeasonPass {
    return {
        id: passId,
        userId,
        seasonStartYear: 2024,
        price: 1000,
        label: 'Pass',
        category: 'cat',
        row: 'row',
        seat: 'seat',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}
