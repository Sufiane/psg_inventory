import type { SeasonPassId } from '@psg/shared/ids';
import { seasonStartYearFromDate } from './season';
import type { SaleDetail, SeasonPass } from './types';

/**
 * The passes a sale form may offer for a given match.
 *
 * `keepPassIds` is the edit-form escape hatch: a pass already allocated to the
 * sale stays visible even if its season disagrees, because hiding its input
 * would silently zero those tickets on the next save. Create forms omit it.
 *
 * Returns `[]` for a nullish `matchDate` — the "no match picked yet" case.
 * Callers distinguish that from "this season has no passes" by testing the
 * selected match themselves.
 */
export function passesForMatch(
    passes: SeasonPass[],
    matchDate: Date | string | null | undefined,
    keepPassIds?: ReadonlySet<SeasonPassId>,
): SeasonPass[] {
    if (matchDate == null) {
        return [];
    }

    const season = seasonStartYearFromDate(
        matchDate instanceof Date ? matchDate : new Date(matchDate),
    );

    return passes.filter(
        (pass) => pass.seasonStartYear === season || keepPassIds?.has(pass.id) === true,
    );
}

/**
 * Sibling to `passesForMatch` for the two edit-form call sites: builds the
 * allocated-pass-id set from `sale.Allocations` and filters against the
 * sale's match date, so callers don't each hand-build the same `Set`.
 */
export function passesForSale(passes: SeasonPass[], sale: SaleDetail): SeasonPass[] {
    const allocatedPassIds = new Set(
        (sale.Allocations ?? []).map((allocation) => allocation.seasonPassId),
    );

    return passesForMatch(passes, sale.Match.date, allocatedPassIds);
}
