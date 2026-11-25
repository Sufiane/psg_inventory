import type { TicketCount } from '@psg/shared/counts';
import { SaleAllocationInput } from '../../../db/sales/sales.db.interface';

export function sumTickets(allocations: SaleAllocationInput[]): TicketCount {
    return allocations.reduce(
        (total, allocation) => total + allocation.nbTickets,
        0,
    ) as TicketCount;
}
