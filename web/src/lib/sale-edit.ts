import { dateTime, money, signedMoney } from './format';
import type { SaleAllocation, SaleStatus, SeasonPass } from './types';

export function isStatusAllowed(
    current: SaleStatus,
    target: SaleStatus,
    isPastMatch: boolean,
): boolean {
    if (target === current) {
        return true;
    }

    switch (target) {
        case 'SOLD':
            return current !== 'GIFTED';
        case 'PENDING':
            return current === 'SOLD';
        case 'GIFTED':
            return current === 'PENDING' && !isPastMatch;
        default:
            return false;
    }
}

export function passCostBasisHint(
    passes: SeasonPass[],
    allocations: SaleAllocation[] | undefined,
    homeFixtures: number | null,
): string | null {
    if (homeFixtures === null || homeFixtures === 0 || passes.length === 0) {
        return null;
    }

    const allocated = passes.filter((pass) =>
        allocations?.some(
            (alloc) => alloc.seasonPassId === pass.id && alloc.nbTickets > 0,
        ),
    );
    const counted = allocated.length > 0 ? allocated : passes;
    const total = counted.reduce((sum, pass) => sum + pass.price, 0);

    return `Pass cost basis: ${money(total)} ÷ ${homeFixtures} home matches`;
}

export function saveConfirmMessage(input: {
    current: SaleStatus;
    draft: SaleStatus;
    opponent: string;
    isPastMatch: boolean;
    matchDate: Date;
    net: number;
}): string | null {
    const { current, draft, opponent, isPastMatch, matchDate, net } = input;
    const statusChanged = draft !== current;

    if (statusChanged && draft === 'SOLD') {
        if (!isPastMatch) {
            return null;
        }

        return `Mark the ${opponent} sale as sold? Match was on ${dateTime(matchDate)}; this writes a historical sale.`;
    }

    if (statusChanged && draft === 'PENDING' && current === 'SOLD') {
        return `Revert the ${opponent} sale to pending? This removes ${signedMoney(net)} from realized net profit.`;
    }

    if (!isPastMatch) {
        return null;
    }

    return `Save changes to the ${opponent} sale? The match was on ${dateTime(matchDate)}; this rewrites historical numbers.`;
}

export function deleteConfirmMessage(input: {
    opponent: string;
    isPastMatch: boolean;
    matchDate: Date;
}): string {
    const { opponent, isPastMatch, matchDate } = input;

    if (!isPastMatch) {
        return `Delete the ${opponent} sale?`;
    }

    return `Delete the ${opponent} sale? The match was on ${dateTime(matchDate)}; this rewrites historical numbers.`;
}
