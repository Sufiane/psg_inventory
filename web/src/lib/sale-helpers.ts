import type { SaleStatus } from './types';

export function statusPill(status: SaleStatus): string {
    switch (status) {
        case 'SOLD':
            return 'bg-positive/15 text-positive-strong';
        case 'PENDING':
            return 'bg-warning/15 text-warning-strong';
        case 'CANCELLED':
            return 'bg-sunk/15 text-sunk-strong';
        case 'GIFTED':
            return 'bg-gift/15 text-gift-strong';
    }
}

export function profitTone(status: SaleStatus, profit: number): string {
    if (status === 'CANCELLED') {
        return 'text-sunk';
    }

    if (status === 'GIFTED') {
        return 'text-gift';
    }

    if (status === 'PENDING') {
        return 'text-warning';
    }

    if (profit < 0) {
        return 'text-negative';
    }

    if (profit > 0) {
        return 'text-positive';
    }

    return 'text-ink';
}
