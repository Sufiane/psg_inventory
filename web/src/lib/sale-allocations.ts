import type { TicketCount } from '@psg/shared/counts';
import type { SeasonPassId } from '@psg/shared/ids';
import type { SaleAllocation } from './types';

const ALLOC_PREFIX = 'alloc_';

export function parseAllocationsFromForm(form: FormData): SaleAllocation[] {
    const allocations: SaleAllocation[] = [];

    for (const [key, value] of form.entries()) {
        if (!key.startsWith(ALLOC_PREFIX)) {
            continue;
        }

        const seasonPassId = key.slice(ALLOC_PREFIX.length) as SeasonPassId;

        if (typeof value !== 'string' || value.length === 0) {
            continue;
        }

        const nbTickets = Number(value);

        if (!Number.isInteger(nbTickets) || nbTickets <= 0) {
            continue;
        }

        allocations.push({ seasonPassId, nbTickets: nbTickets as TicketCount });
    }

    return allocations;
}
