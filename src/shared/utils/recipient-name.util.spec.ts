import { normalizeRecipientName } from './recipient-name.util';

describe('normalizeRecipientName', () => {
    it('trims leading and trailing whitespace', () => {
        expect(normalizeRecipientName('  Marc  ')).toBe('Marc');
    });

    it('collapses internal whitespace runs to a single space', () => {
        expect(normalizeRecipientName('Marc   Dupont')).toBe('Marc Dupont');
    });

    describe('when the input is whitespace-only', () => {
        it('returns an empty string', () => {
            expect(normalizeRecipientName('   ')).toBe('');
        });
    });
});
