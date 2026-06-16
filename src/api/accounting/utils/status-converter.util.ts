import type { AccountingStatus } from '../types/accounting-status.type';

// Maps the api-side accounting bucket to the db SaleStatus enum value.
// Returns the literal strings so the api layer never imports Prisma; the
// db layer accepts them because Prisma's SaleStatus is itself a string
// enum with these exact values.
export function statusConverter(
    status: AccountingStatus,
): 'SOLD' | 'PENDING' | 'CANCELLED' {
    switch (status) {
        case 'pending':
            return 'PENDING';
        case 'realized':
            return 'SOLD';
        case 'unrealized':
            return 'CANCELLED';
    }
}
