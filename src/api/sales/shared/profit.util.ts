import type { ListedPrice, Profit } from '@psg/shared/money';

import { PSG_COMMISSION } from '../../../shared/constants';

/**
 * Compute the seller's profit after the PSG commission is deducted.
 *
 * This is the single source of truth for the profit formula used across the
 * application. All profit calculations should call this util rather than
 * inlining the formula.
 */
export function computeProfit(price: ListedPrice): Profit {
    return ((price * (100 - PSG_COMMISSION)) / 100) as Profit;
}
