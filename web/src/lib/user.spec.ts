import { describe, expect, it } from 'vitest';
import { initialsFromEmail } from './user';

describe('initialsFromEmail', () => {
    describe('when the local part has a dot or dash', () => {
        it('uses the first letter of the first two words', () => {
            expect(initialsFromEmail('jean.dupont@x.fr')).toBe('JD');
            expect(initialsFromEmail('jean-dupont@x.fr')).toBe('JD');
        });
    });

    describe('when the local part is one word', () => {
        it('uses the first two characters uppercased', () => {
            expect(initialsFromEmail('sufiane@x.fr')).toBe('SU');
        });
    });

    describe('when the email is empty', () => {
        it('returns a question mark', () => {
            expect(initialsFromEmail('')).toBe('?');
        });
    });
});
