export type WholeEuroField = 'listedPrice' | 'invest';

const RULES: Record<WholeEuroField, { label: string; min: number; minMessage: string }> = {
    listedPrice: {
        label: 'Listed price',
        min: 1,
        minMessage: 'Listed price must be at least 1.',
    },
    invest: {
        label: 'Invest',
        min: 0,
        minMessage: 'Invest must be 0 or more.',
    },
};

export function validateWholeEuro(field: WholeEuroField, value: number): string | null {
    const rule = RULES[field];

    if (Number.isFinite(value) && !Number.isInteger(value)) {
        return `${rule.label} must be a whole number of euros.`;
    }

    if (!Number.isFinite(value) || value < rule.min) {
        return rule.minMessage;
    }

    return null;
}

export const WHOLE_EURO_HINT = 'Whole euros only.';

export function wholeEuroHint(raw: string): string | null {
    if (raw.trim() === '') {
        return null;
    }

    const value = Number(raw);

    return Number.isFinite(value) && !Number.isInteger(value) ? WHOLE_EURO_HINT : null;
}
