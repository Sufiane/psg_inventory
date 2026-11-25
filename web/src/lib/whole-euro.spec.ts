import { describe, expect, it } from 'vitest';
import { WHOLE_EURO_HINT, validateWholeEuro, wholeEuroHint } from './whole-euro';

describe('validateWholeEuro', () => {
    describe('when the field is listedPrice', () => {
        describe('when the value is a whole number of at least 1', () => {
            it('returns null', () => {
                expect(validateWholeEuro('listedPrice', 1)).toBeNull();
                expect(validateWholeEuro('listedPrice', 250)).toBeNull();
            });
        });

        describe('when the value has decimals', () => {
            it('returns the whole-number error', () => {
                expect(validateWholeEuro('listedPrice', 10.5)).toBe(
                    'Listed price must be a whole number of euros.',
                );
            });
        });

        describe('when the value is below 1', () => {
            it('returns the minimum error', () => {
                expect(validateWholeEuro('listedPrice', 0)).toBe(
                    'Listed price must be at least 1.',
                );
            });
        });

        describe('when the value is not finite', () => {
            it('returns the minimum error', () => {
                expect(validateWholeEuro('listedPrice', Number.NaN)).toBe(
                    'Listed price must be at least 1.',
                );
                expect(validateWholeEuro('listedPrice', Number.POSITIVE_INFINITY)).toBe(
                    'Listed price must be at least 1.',
                );
            });
        });
    });

    describe('when the field is invest', () => {
        describe('when the value is a whole number of at least 0', () => {
            it('returns null', () => {
                expect(validateWholeEuro('invest', 0)).toBeNull();
                expect(validateWholeEuro('invest', 40)).toBeNull();
            });
        });

        describe('when the value has decimals', () => {
            it('returns the whole-number error', () => {
                expect(validateWholeEuro('invest', 0.5)).toBe(
                    'Invest must be a whole number of euros.',
                );
            });
        });

        describe('when the value is negative', () => {
            it('returns the minimum error', () => {
                expect(validateWholeEuro('invest', -1)).toBe('Invest must be 0 or more.');
            });
        });

        describe('when the value is not finite', () => {
            it('returns the minimum error', () => {
                expect(validateWholeEuro('invest', Number.NaN)).toBe(
                    'Invest must be 0 or more.',
                );
            });
        });
    });
});

describe('wholeEuroHint', () => {
    describe.each(['', '   '])(
        'when the raw value is empty or whitespace (%j)',
        (raw) => {
            it('returns null', () => {
                expect(wholeEuroHint(raw)).toBeNull();
            });
        },
    );

    describe.each(['33', '33.0', '1e2', '0'])(
        'when the raw value is a whole number (%s)',
        (raw) => {
            it('returns null', () => {
                expect(wholeEuroHint(raw)).toBeNull();
            });
        },
    );

    describe.each(['33.5', '0.01', '-2.5'])(
        'when the raw value is a decimal (%s)',
        (raw) => {
            it('returns the hint', () => {
                expect(wholeEuroHint(raw)).toBe(WHOLE_EURO_HINT);
            });
        },
    );

    describe('when the raw value is not a number', () => {
        it('returns null', () => {
            expect(wholeEuroHint('abc')).toBeNull();
        });
    });
});
