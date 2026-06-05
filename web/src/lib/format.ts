const EUR = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
});

const EUR_SIGNED = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
});

const DATE = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
});

const DATE_SHORT = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
});

export function money(n: number): string {
    return EUR.format(n);
}

/**
 * Money with an explicit sign on non-zero values: `+€1 234,56` / `−€1 234,56`.
 * Use anywhere the value's direction is semantically meaningful (profit,
 * loss, net) so the sign carries the signal alongside color — keeps
 * profit/loss legible under color blindness.
 */
export function signedMoney(n: number): string {
    return EUR_SIGNED.format(n);
}

export function dateTime(iso: string | Date): string {
    const date = typeof iso === 'string' ? new Date(iso) : iso;

    return DATE.format(date);
}

export function shortDate(iso: string | Date): string {
    const date = typeof iso === 'string' ? new Date(iso) : iso;

    return DATE_SHORT.format(date);
}

export function competitionLabel(value: string): string {
    return value
        .split('_')
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Whole-day difference from `from` → `to`, floored. Negative when `to` is
 * before `from`. Locale-independent: we only care about the calendar-day delta.
 */
export function daysBetween(from: string | Date, to: string | Date): number {
    const fromDate = typeof from === 'string' ? new Date(from) : from;
    const toDate = typeof to === 'string' ? new Date(to) : to;

    return Math.floor((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY);
}

/**
 * Human label for a lead-time in days. The api rejects sold-after-kickoff so
 * inputs are expected non-negative; legacy/backfilled rows are clamped.
 */
export function leadDaysLabel(days: number): string {
    if (days <= 0) {
        return 'same day';
    }

    if (days === 1) {
        return '1 d ahead';
    }

    return `${days} d ahead`;
}
