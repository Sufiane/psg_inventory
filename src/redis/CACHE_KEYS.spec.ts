import type { MatchId, SaleId, UserId } from '@psg/shared/ids';

import CACHE_KEYS from './CACHE_KEYS';

describe('CACHE_KEYS', () => {
    describe('invalidateMatches', () => {
        it('returns the whole matches namespace', () => {
            expect(CACHE_KEYS.invalidateMatches()).toBe('matches:*');
        });

        it('produces a pattern that covers the keys the match cache writes under', () => {
            const key = CACHE_KEYS.matches(
                new Date('2025-08-01T00:00:00.000Z'),
                new Date('2026-08-01T00:00:00.000Z'),
                true,
            );
            const prefix = CACHE_KEYS.invalidateMatches().replace('*', '');

            expect(key.startsWith(prefix)).toBe(true);
        });
    });

    describe('match', () => {
        describe('when withResult differs', () => {
            it('produces distinct keys for the same match id', () => {
                const withResult = CACHE_KEYS.match('match-id' as MatchId, true);
                const withoutResult = CACHE_KEYS.match('match-id' as MatchId, false);

                expect(withResult).not.toBe(withoutResult);
            });
        });
    });

    describe('invalidateSales', () => {
        it('produces a pattern that covers the key the sales list is cached under', () => {
            const key = CACHE_KEYS.sales('user-id' as UserId);
            const prefix = CACHE_KEYS.invalidateSales('user-id' as UserId).replace(
                '*',
                '',
            );

            expect(key.startsWith(prefix)).toBe(true);
        });

        it('produces a pattern that covers the key a ranged sales query is cached under', () => {
            const key = CACHE_KEYS.salesByRange(
                'user-id' as UserId,
                new Date('2025-08-01T00:00:00.000Z'),
                new Date('2026-08-01T00:00:00.000Z'),
            );
            const prefix = CACHE_KEYS.invalidateSales('user-id' as UserId).replace(
                '*',
                '',
            );

            expect(key.startsWith(prefix)).toBe(true);
        });

        describe('sale key', () => {
            const userId = 'user-id' as UserId;
            const saleId = 'sale-id' as SaleId;

            it('is covered by the invalidateSales pattern of the same user', () => {
                const prefix = CACHE_KEYS.invalidateSales(userId).replace('*', '');

                expect(CACHE_KEYS.sale(userId, saleId).startsWith(prefix)).toBe(true);
            });

            it('is not covered by the invalidateSales pattern of another user', () => {
                const prefix = CACHE_KEYS.invalidateSales('other-user' as UserId).replace(
                    '*',
                    '',
                );

                expect(CACHE_KEYS.sale(userId, saleId).startsWith(prefix)).toBe(false);
            });

            it('differs from the other sales keys of the same user', () => {
                const key = CACHE_KEYS.sale(userId, saleId);

                expect(key).not.toBe(CACHE_KEYS.sales(userId));
                expect(key).not.toBe(
                    CACHE_KEYS.salesByMatch(userId, 'sale-id' as MatchId),
                );
                expect(key).not.toBe(
                    CACHE_KEYS.salesByRange(
                        userId,
                        new Date('2025-08-01T00:00:00.000Z'),
                        new Date('2026-08-01T00:00:00.000Z'),
                    ),
                );
            });
        });
    });
});
