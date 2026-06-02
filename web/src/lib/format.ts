const EUR = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
});

export function money(n: number): string {
    return EUR.format(n);
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
