import type { AccountingStatus, RawSaleStatus } from '../types/accounting-status.type';

// A bucket can span several db statuses: a gifted ticket produced no cash, so
// it belongs to `unrealized` alongside `CANCELLED`, while `gifted` reports the
// gift share of that same total.
export function statusConverter(status: AccountingStatus): RawSaleStatus[] {
    switch (status) {
        case 'pending':
            return ['PENDING'];
        case 'realized':
            return ['SOLD'];
        case 'unrealized':
            return ['CANCELLED', 'GIFTED'];
        case 'gifted':
            return ['GIFTED'];
    }
}
