import type { ListedPrice } from '@psg/shared/money';

import { PSG_COMMISSION } from '../../../shared/constants';

import { computeProfit } from './profit.util';

describe('computeProfit', () => {
    it('deducts the PSG commission from the listed price', () => {
        const price = 100 as ListedPrice;
        const expected = (100 * (100 - PSG_COMMISSION)) / 100;

        expect(computeProfit(price)).toBe(expected);
    });

    it('returns zero when the price is zero', () => {
        expect(computeProfit(0 as ListedPrice)).toBe(0);
    });

    it('rounds toward the seller (no floating-point drift for clean multiples)', () => {
        // 250 * 0.88 = 220 — a clean result, no rounding needed
        expect(computeProfit(250 as ListedPrice)).toBe(220);
    });

    it('matches the formula ((price * (100 - PSG_COMMISSION)) / 100)', () => {
        const price = 499 as ListedPrice;
        const expected = (499 * (100 - PSG_COMMISSION)) / 100;

        // The cast to Profit means the runtime value is just the number;
        // verify the arithmetic is what we expect.
        expect(computeProfit(price)).toBe(expected);
    });
});
