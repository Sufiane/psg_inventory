import { SaleStatus } from '@prisma/client';

export function statusConverter(status: 'realized' | 'pending' | 'unrealized'): SaleStatus {
    switch (status) {
        case'pending':
            return SaleStatus.PENDING;
        case'realized':
            return SaleStatus.SOLD;
        case'unrealized':
            return SaleStatus.CANCELLED;
        default:
            throw new Error('unknown_status');
    }
}
