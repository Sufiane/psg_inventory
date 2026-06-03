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

export function competitionLabel(value: string): string {
    return value
        .split('_')
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');
}
