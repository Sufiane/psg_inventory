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
                const withResult = CACHE_KEYS.match('match-id', true);
                const withoutResult = CACHE_KEYS.match('match-id', false);

                expect(withResult).not.toBe(withoutResult);
            });
        });
    });

    describe('invalidateSales', () => {
        it('produces a pattern that covers the key the sales list is cached under', () => {
            const key = CACHE_KEYS.sales('user-id');
            const prefix = CACHE_KEYS.invalidateSales('user-id').replace('*', '');

            expect(key.startsWith(prefix)).toBe(true);
        });

        it('produces a pattern that covers the key a ranged sales query is cached under', () => {
            const key = CACHE_KEYS.salesByRange(
                'user-id',
                new Date('2025-08-01T00:00:00.000Z'),
                new Date('2026-08-01T00:00:00.000Z'),
            );
            const prefix = CACHE_KEYS.invalidateSales('user-id').replace('*', '');

            expect(key.startsWith(prefix)).toBe(true);
        });
    });
});
